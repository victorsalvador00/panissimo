using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Purchasing;

namespace Sgo.Application.Purchasing;

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="LotNumber">Required when the item tracks lots.</param>
/// <param name="ExpirationDate">Optional: an existing lot keeps its date; a new one is computed from the item's shelf life.</param>
public sealed record GoodsReceiptLineRequest(Guid PoLineId, decimal Quantity, string? LotNumber, DateOnly? ExpirationDate);

/// <param name="PoVersion">Version of the purchase order being received (concurrency).</param>
public sealed record CreateGoodsReceiptRequest(
    Guid PurchaseOrderId, uint PoVersion, string? SupplierInvoiceNumber, IReadOnlyList<GoodsReceiptLineRequest> Lines);

public sealed record GoodsReceiptListQuery : PageQuery
{
    public Guid? PurchaseOrderId { get; init; }
    public Guid? SupplierId { get; init; }
    public Guid? LocationId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record GoodsReceiptOrderDto(Guid Id, string Folio);

public sealed record GoodsReceiptListItemDto(
    Guid Id, string Folio, GoodsReceiptOrderDto PurchaseOrder, PurchaseOrderSupplierDto Supplier, PurchasingLocationDto Location,
    DateTimeOffset ReceivedAt, string? SupplierInvoiceNumber, int LineCount, decimal TotalCost);

/// <param name="Quantity">In the purchase unit (<paramref name="PurchaseUomCode"/>).</param>
/// <param name="BaseQuantity">In the base unit (<paramref name="BaseUomCode"/>).</param>
public sealed record GoodsReceiptLineDto(
    Guid Id, Guid PurchaseOrderLineId, Guid ItemId, string Sku, string ItemName, string PurchaseUomCode, decimal Quantity,
    string BaseUomCode, decimal BaseQuantity, decimal UnitCostBase, decimal Amount, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate);

public sealed record GoodsReceiptDto(
    Guid Id, string Folio, GoodsReceiptOrderDto PurchaseOrder, PurchaseOrderSupplierDto Supplier, PurchasingLocationDto Location,
    DateTimeOffset ReceivedAt, Guid? ReceivedBy, string? ReceivedByName, string? SupplierInvoiceNumber, IReadOnlyList<GoodsReceiptLineDto> Lines,
    decimal TotalCost, PurchaseOrderStatus PurchaseOrderStatus);

public sealed class CreateGoodsReceiptRequestValidator : AbstractValidator<CreateGoodsReceiptRequest>
{
    public CreateGoodsReceiptRequestValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty().WithName("Orden de compra");
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(50).WithName("Factura del proveedor");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Captura al menos una línea recibida.");
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

    /// <summary>RN-32/33: posts PurchaseReceipt movements and updates the order, in one transaction.</summary>
    Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequest request, CancellationToken ct = default);
}

public sealed class GoodsReceiptService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    ILotRegistry lots,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IGoodsReceiptService
{
    private static readonly Dictionary<string, Expression<Func<GoodsReceipt, object?>>> SortColumns = new()
    {
        ["folio"] = r => r.Folio,
        ["receivedAt"] = r => r.ReceivedAt,
    };

    public async Task<PagedResult<GoodsReceiptListItemDto>> ListAsync(GoodsReceiptListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var receipts = db.GoodsReceipts.AsNoTracking().Where(r => allowed.Contains(r.LocationId));
        if (query.PurchaseOrderId is { } orderId)
            receipts = receipts.Where(r => r.PurchaseOrderId == orderId);
        if (query.SupplierId is { } supplierId)
            receipts = receipts.Where(r => db.PurchaseOrders.Any(o => o.Id == r.PurchaseOrderId && o.SupplierId == supplierId));
        if (query.LocationId is { } locationId)
            receipts = receipts.Where(r => r.LocationId == locationId);
        if (query.From is { } from)
            receipts = receipts.Where(r => r.ReceivedAt >= from);
        if (query.To is { } to)
            receipts = receipts.Where(r => r.ReceivedAt <= to);
        if (query.SearchTerm() is { } term)
            receipts = receipts.Where(r => r.Folio.ToLower().Contains(term)
                                           || (r.SupplierInvoiceNumber != null && r.SupplierInvoiceNumber.ToLower().Contains(term)));

        var page = await receipts.Include(r => r.Lines).ApplySort(query.Sort, SortColumns, "receivedAt:desc").ToPagedResultAsync(query, ct);
        var orders = await OrdersAsync(page.Items.Select(r => r.PurchaseOrderId), ct);
        var suppliers = await PurchaseOrderService.SuppliersAsync(db, orders.Values.Select(o => o.SupplierId), ct);
        var locations = await PurchaseOrderService.LocationsAsync(db, page.Items.Select(r => r.LocationId), ct);
        var items = page.Items.Select(r => new GoodsReceiptListItemDto(r.Id, r.Folio,
            new GoodsReceiptOrderDto(r.PurchaseOrderId, orders[r.PurchaseOrderId].Folio), suppliers[orders[r.PurchaseOrderId].SupplierId],
            locations[r.LocationId], r.ReceivedAt, r.SupplierInvoiceNumber, r.Lines.Count, r.TotalCost)).ToList();
        return new PagedResult<GoodsReceiptListItemDto>(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<GoodsReceiptDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var receipt = await db.GoodsReceipts.AsNoTracking().Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct)
                      ?? throw new NotFoundException("la recepción", id);
        scope.EnsureAccess(receipt.LocationId);
        return await ToDtoAsync(receipt, ct);
    }

    public async Task<GoodsReceiptDto> CreateAsync(CreateGoodsReceiptRequest request, CancellationToken ct = default)
    {
        var order = await db.PurchaseOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == request.PurchaseOrderId, ct)
                    ?? throw new NotFoundException("la orden de compra", request.PurchaseOrderId);
        scope.EnsureAccess(order.DeliveryLocationId);
        db.EnsureVersion(order, request.PoVersion);
        var location = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == order.DeliveryLocationId, ct);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");

        var tolerance = await db.GetDecimalSettingAsync(AppSettingKeys.ReceiptTolerancePct, ct);
        var poLines = order.Lines.ToDictionary(l => l.Id);
        var unknown = request.Lines.FirstOrDefault(l => !poLines.ContainsKey(l.PoLineId));
        if (unknown is not null)
            throw new BusinessRuleException("purchase_order_line_not_found", "Una línea indicada no pertenece a la orden de compra.");
        var itemIds = order.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // First write: claims the order row. A concurrent receipt waits on this lock and then fails the version check (409).
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);

        order.Receive(request.Lines.Select(l => new LineReceipt(l.PoLineId, l.Quantity)).ToList(), tolerance);

        var receiptId = Guid.CreateVersion7();
        var today = clock.BusinessDate();
        var inputs = new List<GoodsReceiptLineInput>();
        foreach (var line in request.Lines)
        {
            var poLine = poLines[line.PoLineId];
            var item = items[poLine.ItemId];
            var (lotId, lotNumber, expiration) = await ResolveLotAsync(item.Id, item.Sku, item.TracksLots, item.ShelfLifeDays,
                line.LotNumber, line.ExpirationDate, today, receiptId, ct);
            inputs.Add(new GoodsReceiptLineInput(poLine.Id, item.Id, line.Quantity, poLine.UnitPrice, item.PurchaseToBaseFactor,
                lotId, lotNumber, expiration));
        }

        var receipt = new GoodsReceipt(receiptId, await folios.NextAsync(DocType.GoodsReceipt, ct), order.Id, order.DeliveryLocationId,
            clock.UtcNow, currentUser.UserId, request.SupplierInvoiceNumber, inputs);
        db.GoodsReceipts.Add(receipt);
        await posting.PostAsync(receipt.ToMovementRequests(), ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await ToDtoAsync(receipt, ct);
    }

    /// <summary>
    /// Lot items need a lot number (decisión 5). Without a date, an existing lot keeps its own and a new one gets
    /// today + shelf life. Expired lots are not received.
    /// </summary>
    private async Task<(Guid? LotId, string? LotNumber, DateOnly? Expiration)> ResolveLotAsync(
        Guid itemId, string sku, bool tracksLots, int? shelfLifeDays, string? lotNumber, DateOnly? expiration, DateOnly today,
        Guid receiptId, CancellationToken ct)
    {
        if (!tracksLots)
        {
            if (!string.IsNullOrWhiteSpace(lotNumber))
                throw new BusinessRuleException("lot_not_allowed", $"El artículo {sku} no maneja lotes.");
            return (null, null, null);
        }
        if (string.IsNullOrWhiteSpace(lotNumber))
            throw new BusinessRuleException("lot_required", $"El artículo {sku} maneja lotes: captura el número de lote.");

        var number = lotNumber.Trim();
        if (expiration is null)
        {
            var existing = db.Lots.Local.FirstOrDefault(l => l.ItemId == itemId && l.LotNumber == number)
                           ?? await db.Lots.AsNoTracking().SingleOrDefaultAsync(l => l.ItemId == itemId && l.LotNumber == number, ct);
            expiration = existing is not null ? existing.ExpirationDate : shelfLifeDays is { } days ? today.AddDays(days) : null;
        }
        if (expiration < today)
            throw new BusinessRuleException("lot_expired", $"El lote {number} de {sku} ya caducó ({expiration:dd/MM/yyyy}); no se recibe.");

        var lot = await lots.GetOrCreateAsync(itemId, number, expiration, GoodsReceipt.DocType, receiptId, ct);
        return (lot.Id, lot.LotNumber, lot.ExpirationDate);
    }

    private async Task<Dictionary<Guid, PurchaseOrder>> OrdersAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.PurchaseOrders.AsNoTracking().Where(o => list.Contains(o.Id)).ToDictionaryAsync(o => o.Id, ct);
    }

    private async Task<GoodsReceiptDto> ToDtoAsync(GoodsReceipt r, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.AsNoTracking().SingleAsync(o => o.Id == r.PurchaseOrderId, ct);
        var suppliers = await PurchaseOrderService.SuppliersAsync(db, [order.SupplierId], ct);
        var locations = await PurchaseOrderService.LocationsAsync(db, [r.LocationId], ct);
        var itemIds = r.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                           join p in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals p.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Base = b.Code, Purchase = p.Code }).ToDictionaryAsync(i => i.Id, ct);

        var lines = r.Lines.Select(l => new GoodsReceiptLineDto(l.Id, l.PurchaseOrderLineId, l.ItemId, items[l.ItemId].Sku,
                items[l.ItemId].Name, items[l.ItemId].Purchase, l.Quantity, items[l.ItemId].Base, l.BaseQuantity, l.UnitCostBase, l.Amount,
                l.LotId, l.LotNumber, l.ExpirationDate))
            .OrderBy(l => l.Sku).ThenBy(l => l.ExpirationDate).ToList();
        var users = await userDirectory.GetNamesAsync([r.ReceivedBy], ct);

        return new GoodsReceiptDto(r.Id, r.Folio, new GoodsReceiptOrderDto(order.Id, order.Folio), suppliers[order.SupplierId],
            locations[r.LocationId], r.ReceivedAt, r.ReceivedBy, users.Of(r.ReceivedBy), r.SupplierInvoiceNumber, lines, r.TotalCost,
            order.Status);
    }
}
