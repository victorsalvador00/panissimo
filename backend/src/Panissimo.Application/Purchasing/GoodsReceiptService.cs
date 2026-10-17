using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

/// <param name="Quantity">In purchase unit. A line may come several times, once per lot.</param>
/// <param name="LotNumber">Required for items that track lots (RN-05); not allowed otherwise.</param>
/// <param name="ExpirationDate">Empty: the existing lot's, or business date + ShelfLifeDays for a new lot.</param>
/// <param name="WarehouseId">Sub-warehouse of this line; empty takes the receipt's (RN-45).</param>
public sealed record GoodsReceiptLineRequest(Guid PoLineId, decimal Quantity, string? LotNumber, DateOnly? ExpirationDate, Guid? WarehouseId = null);

/// <param name="PoVersion">Version of the purchase order the client saw: a concurrent receipt gets 409.</param>
/// <param name="WarehouseId">Sub-warehouse for every line (RN-45); required when the plant has sub-warehouses, unless each line has one.</param>
public sealed record CreateGoodsReceiptRequest(
    Guid PurchaseOrderId, uint PoVersion, string? SupplierInvoiceNumber, string? Notes, IReadOnlyList<GoodsReceiptLineRequest> Lines,
    Guid? WarehouseId = null);

public sealed record GoodsReceiptListQuery : PageQuery
{
    public Guid? PurchaseOrderId { get; init; }
    public Guid? SupplierId { get; init; }
    public Guid? LocationId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record GoodsReceiptListItemDto(
    Guid Id, string Folio, Guid PurchaseOrderId, string PurchaseOrderFolio, Guid SupplierId, string SupplierName, Guid LocationId,
    string LocationCode, DateTimeOffset ReceivedAt, string? SupplierInvoiceNumber, int LineCount, decimal TotalCost);

/// <param name="UomCode">Purchase unit, or base unit when the item has none.</param>
/// <param name="LineCost">BaseQuantity × UnitCostBase.</param>
public sealed record GoodsReceiptLineDto(
    Guid Id, Guid PurchaseOrderLineId, Guid LocationId, string LocationCode, Guid ItemId, string Sku, string ItemName, string UomCode, decimal Quantity, string BaseUomCode,
    decimal BaseQuantity, decimal UnitCostBase, decimal LineCost, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate);

public sealed record GoodsReceiptDto(
    Guid Id, string Folio, Guid PurchaseOrderId, string PurchaseOrderFolio, PurchaseOrderStatus PurchaseOrderStatus, Guid SupplierId,
    string SupplierName, Guid LocationId, string LocationCode, string LocationName, DateTimeOffset ReceivedAt, string? ReceivedByName,
    string? SupplierInvoiceNumber, string? Notes, IReadOnlyList<GoodsReceiptLineDto> Lines, decimal TotalCost);

public sealed class CreateGoodsReceiptRequestValidator : AbstractValidator<CreateGoodsReceiptRequest>
{
    public CreateGoodsReceiptRequestValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty().WithName("Orden de compra");
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(GoodsReceipt.InvoiceMaxLength).WithName("Factura del proveedor");
        RuleFor(x => x.Notes).MaximumLength(GoodsReceipt.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Captura al menos una cantidad recibida.")
            .Must(lines => lines.GroupBy(l => (l.PoLineId, Lot: l.LotNumber?.Trim().ToUpperInvariant())).All(g => g.Count() == 1))
            .WithMessage("Hay líneas repetidas con el mismo lote.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
            line.RuleFor(l => l.LotNumber).MaximumLength(50).WithName("Lote");
        });
    }
}

public interface IGoodsReceiptService
{
    Task<PagedResult<GoodsReceiptListItemDto>> ListAsync(GoodsReceiptListQuery query, CancellationToken ct = default);
    Task<GoodsReceiptDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>RN-32/RN-33: posts PurchaseReceipt at the plant at UnitPrice / factor and advances the purchase order.</summary>
    Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequest request, CancellationToken ct = default);
}

public sealed class GoodsReceiptService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory,
    IInventoryPostingService posting,
    ILotRegistry lots) : IGoodsReceiptService
{
    private static readonly Dictionary<string, Expression<Func<GoodsReceipt, object?>>> SortColumns = new()
    {
        ["folio"] = g => g.Folio,
        ["receivedAt"] = g => g.ReceivedAt,
    };

    public async Task<PagedResult<GoodsReceiptListItemDto>> ListAsync(GoodsReceiptListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var receipts = db.GoodsReceipts.AsNoTracking().Include(g => g.Lines).Where(g => allowed.Contains(g.LocationId));
        if (query.PurchaseOrderId is { } orderId)
            receipts = receipts.Where(g => g.PurchaseOrderId == orderId);
        if (query.SupplierId is { } supplierId)
            receipts = receipts.Where(g => db.PurchaseOrders.Any(o => o.Id == g.PurchaseOrderId && o.SupplierId == supplierId));
        if (query.LocationId is { } locationId)
            receipts = receipts.Where(g => g.LocationId == locationId);
        if (query.From is { } from)
            receipts = receipts.Where(g => g.ReceivedAt >= from);
        if (query.To is { } to)
            receipts = receipts.Where(g => g.ReceivedAt <= to);
        if (query.SearchTerm() is { } term)
            receipts = receipts.Where(g => g.Folio.ToLower().Contains(term)
                                           || (g.SupplierInvoiceNumber != null && g.SupplierInvoiceNumber.ToLower().Contains(term)));

        var page = await receipts.ApplySort(query.Sort, SortColumns, "receivedAt:desc").ToPagedResultAsync(query, ct);

        var orderIds = page.Items.Select(g => g.PurchaseOrderId).Distinct().ToList();
        var orders = await (from o in db.PurchaseOrders
                            join s in db.Suppliers on o.SupplierId equals s.Id
                            where orderIds.Contains(o.Id)
                            select new { o.Id, o.Folio, o.SupplierId, SupplierName = s.Name })
            .ToDictionaryAsync(x => x.Id, ct);
        var locationIds = page.Items.Select(g => g.LocationId).Distinct().ToList();
        var locations = await db.Locations.Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return new PagedResult<GoodsReceiptListItemDto>(page.Items.Select(g =>
        {
            var order = orders[g.PurchaseOrderId];
            return new GoodsReceiptListItemDto(g.Id, g.Folio, g.PurchaseOrderId, order.Folio, order.SupplierId, order.SupplierName,
                g.LocationId, locations[g.LocationId], g.ReceivedAt, g.SupplierInvoiceNumber, g.Lines.Count, g.TotalCost);
        }).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<GoodsReceiptDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var receipt = await db.GoodsReceipts.AsNoTracking().Include(g => g.Lines).SingleOrDefaultAsync(g => g.Id == id, ct)
                      ?? throw new NotFoundException("la recepción", id);
        scope.EnsureAccess(receipt.LocationId);
        return await ToDtoAsync(receipt, ct);
    }

    public async Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequest request, CancellationToken ct = default)
    {
        var order = await db.PurchaseOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == request.PurchaseOrderId, ct)
                    ?? throw new NotFoundException("la orden de compra", request.PurchaseOrderId);
        scope.EnsureAccess(order.DeliveryLocationId); // receiving requires the plant
        db.EnsureVersion(order, request.PoVersion);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.ReceiptTolerancePct, ct);

        var lineItems = order.Lines.ToDictionary(l => l.Id);
        var itemIds = order.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, Pieces = b.Code == UnitOfMeasure.PieceCode })
            .ToDictionaryAsync(x => x.Item.Id, ct);

        // RN-45: the plant or the chosen sub-warehouse of each line, checked before anything is written.
        var picker = await WarehousePicker.LoadAsync(db, scope, order.DeliveryLocationId, ct);
        var targets = request.Lines.Select(l => picker.Resolve(request.WarehouseId, l.WarehouseId)).ToList();

        var errors = new List<string>();
        foreach (var line in request.Lines)
        {
            if (!lineItems.TryGetValue(line.PoLineId, out var poLine))
                continue; // the order reports unknown lines below
            var item = items[poLine.ItemId];
            var sku = item.Item.Sku;
            if (item.Item.TracksLots && string.IsNullOrWhiteSpace(line.LotNumber))
                errors.Add($"{sku} maneja lotes: indica el lote recibido (RN-05).");
            if (!item.Item.TracksLots && (line.LotNumber is not null || line.ExpirationDate is not null))
                errors.Add($"{sku} no maneja lotes: deja vacíos el lote y la caducidad.");
            if (item.Pieces && !InventoryMath.IsWhole(PurchaseReceiptMath.BaseQuantity(line.Quantity, item.Item.PurchaseToBaseFactor)))
                errors.Add($"{sku} se maneja en piezas: la cantidad recibida debe dar piezas enteras.");
        }
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });

        // RN-32: tolerance and status; throws before anything is written.
        order.RegisterReceipt(request.Lines.Select(l => new PurchaseReceiptQuantity(l.PoLineId, l.Quantity)).ToList(), tolerance);

        var receiptId = Guid.CreateVersion7();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // First write claims the order row with the client's version: a concurrent receipt waits and then gets 409.
        await db.SaveChangesAsync(ct);

        var folio = await folios.NextAsync(DocType.GoodsReceipt, ct);
        var inputs = new List<GoodsReceiptLineInput>();
        foreach (var (line, target) in request.Lines.Zip(targets))
        {
            var poLine = lineItems[line.PoLineId];
            var item = items[poLine.ItemId].Item;
            Lot? lot = null;
            if (item.TracksLots)
                lot = await lots.GetOrCreateAsync(item.Id, line.LotNumber!, line.ExpirationDate, GoodsReceipt.DocType, receiptId, ct);
            inputs.Add(new GoodsReceiptLineInput(poLine.Id, target, item.Id, line.Quantity,
                PurchaseReceiptMath.BaseQuantity(line.Quantity, item.PurchaseToBaseFactor),
                PurchaseReceiptMath.UnitCostBase(poLine.UnitPrice, item.PurchaseToBaseFactor),
                lot?.Id, lot?.LotNumber, lot?.ExpirationDate));
        }

        var receipt = new GoodsReceipt(receiptId, folio, order.Id, order.DeliveryLocationId, clock.UtcNow, currentUser.UserId,
            request.SupplierInvoiceNumber, request.Notes, inputs);
        await posting.PostAsync(receipt.Lines.Select(l => new MovementRequest(l.LocationId, l.ItemId, l.LotId,
            MovementType.PurchaseReceipt, l.BaseQuantity, l.UnitCostBase, GoodsReceipt.DocType, receiptId, folio,
            $"Recepción de {order.Folio}")).ToList(), ct);

        db.GoodsReceipts.Add(receipt);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(receipt, ct);
    }

    private async Task<GoodsReceiptDto> ToDtoAsync(GoodsReceipt g, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.AsNoTracking().Where(o => o.Id == g.PurchaseOrderId)
            .Select(o => new { o.Folio, o.Status, o.SupplierId }).SingleAsync(ct);
        var supplierName = await db.Suppliers.Where(s => s.Id == order.SupplierId).Select(s => s.Name).SingleAsync(ct);
        var location = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == g.LocationId, ct);
        var itemIds = g.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join p in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals p.Id
                           join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = p.Code, BaseUom = b.Code })
            .ToDictionaryAsync(x => x.Id, ct);
        var names = await userDirectory.GetNamesAsync([g.ReceivedBy], ct);
        var stockIds = g.Lines.Select(l => l.LocationId).Distinct().ToList();
        var stockCodes = await db.Locations.AsNoTracking().Where(l => stockIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        var lines = g.Lines.Select(l =>
        {
            var item = items[l.ItemId];
            return new GoodsReceiptLineDto(l.Id, l.PurchaseOrderLineId, l.LocationId, stockCodes[l.LocationId], l.ItemId, item.Sku, item.Name, item.Uom, l.Quantity, item.BaseUom,
                l.BaseQuantity, l.UnitCostBase, InventoryMath.Round(l.BaseQuantity * l.UnitCostBase), l.LotId, l.LotNumber, l.ExpirationDate);
        }).ToList();

        return new GoodsReceiptDto(g.Id, g.Folio, g.PurchaseOrderId, order.Folio, order.Status, order.SupplierId, supplierName,
            g.LocationId, location.Code, location.Name, g.ReceivedAt, names.Of(g.ReceivedBy), g.SupplierInvoiceNumber, g.Notes, lines,
            g.TotalCost);
    }
}
