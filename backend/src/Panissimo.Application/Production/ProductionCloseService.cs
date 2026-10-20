using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

/// <param name="Lots">Optional manual split (must add up to <paramref name="ActualQty"/>); without it, FEFO.</param>
/// <param name="WarehouseId">Sub-warehouse it is consumed from; empty takes the close's (RN-45).</param>
public sealed record CloseLineRequest(Guid ComponentItemId, decimal ActualQty, IReadOnlyList<LotQuantity>? Lots, Guid? WarehouseId = null);

/// <param name="Lines">Real consumption per component; a component not listed consumes its theoretical (RN-61).</param>
/// <param name="ConsumptionWarehouseId">Sub-warehouse the components are consumed from (RN-45); a line may choose another.</param>
/// <param name="OutputWarehouseId">Sub-warehouse the product enters (RN-45).</param>
public sealed record CreateProductionCloseRequest(
    uint Version, ProductionCloseKind Kind, decimal ProducedQty, Shift? Shift, string? Notes,
    ShortfallReason? ShortfallReason, string? ShortfallNotes, IReadOnlyList<CloseLineRequest>? Lines,
    Guid? ConsumptionWarehouseId = null, Guid? OutputWarehouseId = null);

public sealed record ClosePreviewLineDto(
    Guid ComponentItemId, string Sku, string Name, string BaseUomCode, bool TracksLots, decimal TheoreticalQty, decimal Available,
    decimal Shortage, decimal AverageCost, decimal EstimatedCost);

/// <summary>What a close of <paramref name="Quantity"/> would consume and cost, and the lot it would create (RN-62).</summary>
public sealed record ClosePreviewDto(
    Guid ProductionOrderId, decimal Quantity, decimal PlannedQty, decimal ProducedQty, decimal PendingQty, decimal MaxAllowedQty,
    bool ExceedsTolerance, int NextSequence, string? NextLotNumber, DateOnly? NextLotExpiration, Shift? Shift,
    IReadOnlyList<ClosePreviewLineDto> Lines, decimal EstimatedTotalCost, decimal EstimatedUnitCost);

public sealed record ProductionCloseLotDto(Guid LotId, string LotNumber, DateOnly? ExpirationDate, decimal Quantity);

public sealed record ProductionCloseLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, string BaseUomCode, Guid LocationId, string LocationCode, decimal TheoreticalQty,
    decimal ActualQty,
    decimal WasteQty, decimal UnitCost, decimal TotalCost, IReadOnlyList<ProductionCloseLotDto> Lots);

public sealed record ProductionCloseDto(
    Guid Id, string Folio, Guid ProductionOrderId, string OrderFolio, int Sequence, ProductionCloseKind Kind, DateOnly BusinessDate,
    Shift? Shift, Guid OutputItemId, string Sku, string ItemName, string BaseUomCode, Guid? FactoryId, string? FactoryCode, string? FactoryName,
    decimal ProducedQty, bool ExceedsTolerance, Guid OutputLocationId, string OutputLocationCode, Guid? OutputLotId, string? OutputLotNumber, DateOnly? OutputLotExpiration, decimal TotalCost, decimal UnitCost,
    decimal WasteQty, decimal WasteCost, DateTimeOffset ClosedAt, Guid? ClosedBy, string? ClosedByName, string? Notes,
    IReadOnlyList<ProductionCloseLineDto> Lines);

public sealed record ProductionCloseResultDto(ProductionCloseDto Close, ProductionOrderDto Order);

public sealed record ProductionCloseListQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    /// <summary>RN-49: the factory of the order's recipe.</summary>
    public Guid? FactoryId { get; init; }
    public Guid? ItemId { get; init; }
    public Guid? ProductionOrderId { get; init; }
    public ProductionCloseKind? Kind { get; init; }
}

public sealed record ProductionCloseListItemDto(
    Guid Id, string Folio, DateOnly BusinessDate, DateTimeOffset ClosedAt, Guid ProductionOrderId, string OrderFolio, Guid OutputItemId,
    string Sku, string ItemName, string BaseUomCode, Guid? FactoryId, string? FactoryCode, string? FactoryName, Shift? Shift, ProductionCloseKind Kind,
    int Sequence, decimal ProducedQty, bool ExceedsTolerance, string? OutputLotNumber, decimal TotalCost, decimal UnitCost, decimal WasteCost,
    string? ClosedByName, Guid? OutputLotId = null);

public sealed class CreateProductionCloseRequestValidator : AbstractValidator<CreateProductionCloseRequest>
{
    public CreateProductionCloseRequestValidator()
    {
        RuleFor(x => x.Kind).IsInEnum().WithName("Tipo de cierre");
        RuleFor(x => x.ProducedQty).GreaterThanOrEqualTo(0).WithName("Cantidad producida")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad producida admite máximo 4 decimales.");
        RuleFor(x => x.Shift).IsInEnum().When(x => x.Shift is not null).WithName("Turno");
        RuleFor(x => x.ShortfallReason).IsInEnum().When(x => x.ShortfallReason is not null).WithName("Motivo del faltante");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.ShortfallNotes).MaximumLength(500).WithName("Notas del faltante");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ActualQty).GreaterThanOrEqualTo(0).WithName("Consumo real")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("El consumo real admite máximo 4 decimales.");
            line.RuleForEach(l => l.Lots).ChildRules(lot => lot.RuleFor(x => x.Qty).GreaterThan(0).WithName("Cantidad del lote"));
        });
        RuleFor(x => x.Lines).Must(lines => lines is null || lines.Select(l => l.ComponentItemId).Distinct().Count() == lines.Count)
            .WithMessage("Hay componentes repetidos.");
    }
}

public interface IProductionCloseService
{
    Task<ClosePreviewDto> PreviewAsync(Guid orderId, decimal quantity, CancellationToken ct = default);

    /// <summary>
    /// RN-61..RN-66 (backend §5.1): in one transaction, posts the real consumption (chosen lots or FEFO), creates the
    /// close's own lot and posts the output at the close's cost, then updates the order. Concurrent closes of the same
    /// order: one wins, the other gets 409.
    /// </summary>
    Task<ProductionCloseResultDto> CreateAsync(Guid orderId, CreateProductionCloseRequest request, CancellationToken ct = default);

    Task<IReadOnlyList<ProductionCloseListItemDto>> ListByOrderAsync(Guid orderId, CancellationToken ct = default);
    Task<PagedResult<ProductionCloseListItemDto>> ListAsync(ProductionCloseListQuery query, CancellationToken ct = default);
    Task<ProductionCloseDto> GetAsync(Guid id, CancellationToken ct = default);
}

public sealed class ProductionCloseService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory,
    IInventoryPostingService posting,
    ILotRegistry lots,
    IProductionOrderService orders) : IProductionCloseService
{
    private static readonly Dictionary<string, Expression<Func<ProductionClose, object?>>> SortColumns = new()
    {
        ["closedAt"] = c => c.ClosedAt,
        ["businessDate"] = c => c.BusinessDate,
        ["folio"] = c => c.Folio,
    };

    public async Task<ClosePreviewDto> PreviewAsync(Guid orderId, decimal quantity, CancellationToken ct = default)
    {
        if (quantity < 0)
            throw new BusinessRuleException("invalid_quantity", "La cantidad no puede ser negativa.");
        var order = await FindAsync(orderId, tracked: false, ct);
        var recipe = await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleAsync(r => r.Id == order.RecipeId, ct);
        var output = await db.Items.AsNoTracking().SingleAsync(i => i.Id == order.OutputItemId, ct);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.OverrunTolerancePct, ct);

        var componentIds = recipe.Lines.Select(l => l.ComponentItemId).ToList();
        var components = await ComponentsAsync(componentIds, ct);
        var today = clock.BusinessDate();
        var available = await RecipeService.UsableStockAsync(db, order.LocationId, componentIds, today, ct);
        var costs = await InventoryLocations.AverageCostsAsync(db, order.LocationId, componentIds, ct);

        var lines = recipe.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            var theoretical = quantity == 0 ? 0 : RecipeRules.Theoretical(quantity, recipe.YieldQty, l.Quantity, l.WastePct);
            var avail = available.GetValueOrDefault(l.ComponentItemId);
            var cost = costs.GetValueOrDefault(l.ComponentItemId);
            return new ClosePreviewLineDto(l.ComponentItemId, c.Sku, c.Name, c.Uom, c.TracksLots, theoretical, avail,
                Math.Max(0, theoretical - avail), cost, InventoryMath.Round(theoretical * cost));
        }).OrderBy(l => l.Sku).ToList();

        var total = lines.Sum(l => l.EstimatedCost);
        var sequence = order.CloseCount + 1;
        return new ClosePreviewDto(order.Id, quantity, order.PlannedQty, order.ProducedQty, order.PendingQty, order.MaxAllowedQty(tolerance),
            order.ProducedQty + quantity > order.MaxAllowedQty(tolerance), sequence, output.TracksLots ? order.LotNumberFor(sequence) : null,
            output.TracksLots && output.ShelfLifeDays is { } days ? today.AddDays(days) : null, order.Shift,
            lines, total, quantity > 0 ? InventoryMath.Round(total / quantity) : 0);
    }

    public async Task<ProductionCloseResultDto> CreateAsync(Guid orderId, CreateProductionCloseRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(orderId, tracked: true, ct);
        db.EnsureVersion(order, request.Version);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.OverrunTolerancePct, ct);
        var exceedsTolerance = order.EnsureCanClose(request.Kind, request.ProducedQty, tolerance, request.ShortfallReason, request.ShortfallNotes);

        var output = await (from i in db.Items join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where i.Id == order.OutputItemId select new { i.Sku, i.TracksLots, Uom = u.Code }).SingleAsync(ct);
        if (output.Uom == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(request.ProducedQty))
            throw new BusinessRuleException("whole_quantity_required", $"{output.Sku} se maneja en piezas: la cantidad producida debe ser entera.");

        var recipe = await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleAsync(r => r.Id == order.RecipeId, ct);
        // RN-49: a recipe with a factory consumes from it and delivers to it; nothing else may be chosen.
        if (await ProductionFloor.EnsureAsync(db, order.LocationId, recipe.FactoryId, output.Sku, ct) is { } floor)
        {
            if (new[] { request.ConsumptionWarehouseId, request.ProducedQty > 0 ? request.OutputWarehouseId : null }
                    .Concat((request.Lines ?? []).Select(l => l.WarehouseId))
                    .Any(w => w is { } id && id != floor.Id))
                throw new BusinessRuleException("close_factory_fixed",
                    $"La receta de {output.Sku} se produce en {floor.Code}: el cierre consume de ella y deja ahí el producto (RN-49).");
            request = request with
            {
                ConsumptionWarehouseId = floor.Id,
                OutputWarehouseId = floor.Id,
                Lines = request.Lines?.Select(l => l with { WarehouseId = null }).ToList(),
            };
        }
        // RN-45: each component leaves its chosen sub-warehouse; the product enters the output one.
        var picker = await WarehousePicker.LoadAsync(db, scope, order.LocationId, ct);
        var lineWarehouses = (request.Lines ?? []).ToDictionary(l => l.ComponentItemId, l => l.WarehouseId);
        var consumption = PlanConsumption(order, recipe, request)
            .Select(c => c with { LocationId = picker.Resolve(request.ConsumptionWarehouseId, lineWarehouses.GetValueOrDefault(c.ComponentItemId)) })
            .ToList();
        var outputLocationId = request.ProducedQty > 0 ? picker.Resolve(request.OutputWarehouseId, null) : order.LocationId;
        foreach (var source in consumption.Select(c => c.LocationId!.Value).Distinct())
            picker.EnsureProductionFloor(source, consumption: true);
        if (request.ProducedQty > 0)
            picker.EnsureProductionFloor(outputLocationId, consumption: false);
        var componentIds = consumption.Select(c => c.ComponentItemId).ToList();
        var sources = consumption.Select(c => c.LocationId!.Value).Distinct().ToList();
        var averageCosts = await db.ItemLocationCosts.AsNoTracking()
            .Where(c => sources.Contains(c.LocationId) && componentIds.Contains(c.ItemId))
            .ToDictionaryAsync(c => (c.LocationId, c.ItemId), c => c.AverageCost, ct);

        var closeId = Guid.CreateVersion7();
        var sequence = order.CloseCount + 1;
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // RN-66: the first write claims the order row with its version; a concurrent close waits and then gets 409.
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);

        var folio = await folios.NextAsync(DocType.ProductionClose, ct);
        // RN-111: what was reserved at the recipe's factory itself (no voucher) is what this close consumes; the reservation
        // goes before the exit is checked and keeps only what is still to be consumed (none after the final close).
        var floorReservations = await db.StockReservations
            .Where(r => r.ProductionOrderId == order.Id && r.TransferId == null).ToListAsync(ct);
        db.StockReservations.RemoveRange(floorReservations);
        var requests = consumption.SelectMany(c => c.Lots.Count > 0
                ? c.Lots.Select(l => Consume(c.LocationId!.Value, c.ComponentItemId, l.LotId, l.Qty))
                : c.ActualQty > 0 ? [Consume(c.LocationId!.Value, c.ComponentItemId, null, c.ActualQty)] : [])
            .ToList();
        var movements = await posting.PostAsync(requests, ct);
        if (request.Kind != ProductionCloseKind.Final)
            foreach (var held in floorReservations)
            {
                var left = held.Quantity - consumption.Where(c => c.ComponentItemId == held.ItemId && c.LocationId == held.LocationId)
                    .Sum(c => c.ActualQty);
                if (left > 0)
                    db.StockReservations.Add(new StockReservation(held.LocationId, held.ItemId, left, order.Id, null, held.CreatedAt));
            }

        // Lots and cost actually taken: FEFO may have split a line among several lots.
        var closeLines = consumption.Select(c =>
        {
            var taken = movements.Where(m => m.ItemId == c.ComponentItemId).ToList();
            var unitCost = taken.Count > 0 ? taken[0].UnitCost : averageCosts.GetValueOrDefault((c.LocationId!.Value, c.ComponentItemId));
            var takenLots = taken.Where(m => m.LotId is not null).Select(m => new LotQuantity(m.LotId!.Value, -m.Quantity)).ToList();
            return c with { UnitCost = unitCost, Lots = takenLots };
        }).ToList();

        Guid? outputLotId = null;
        if (request.ProducedQty > 0 && output.TracksLots)
            // RN-62: expiration = business date + ShelfLifeDays (none without shelf life), applied by the registry.
            outputLotId = (await lots.GetOrCreateAsync(order.OutputItemId, order.LotNumberFor(sequence), null,
                ProductionClose.DocType, closeId, ct)).Id;

        var close = new ProductionClose(closeId, folio, order, request.Kind, clock.BusinessDate(), request.Shift ?? order.Shift,
            request.ProducedQty, outputLotId, closeLines, clock.UtcNow, currentUser.UserId, request.Notes, exceedsTolerance, outputLocationId);

        if (request.ProducedQty > 0)
            await posting.PostAsync([new MovementRequest(outputLocationId, order.OutputItemId, outputLotId, MovementType.ProductionOutput,
                request.ProducedQty, close.UnitCost, ProductionClose.DocType, closeId, folio, $"{order.Folio} cierre {sequence}")], ct);

        db.ProductionCloses.Add(close);
        order.RegisterClose(close, request.ShortfallReason, request.ShortfallNotes);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new ProductionCloseResultDto(await GetAsync(close.Id, ct), await orders.GetAsync(order.Id, ct));

        MovementRequest Consume(Guid locationId, Guid itemId, Guid? lotId, decimal qty) =>
            new(locationId, itemId, lotId, MovementType.ProductionConsumption, -qty, null, ProductionClose.DocType, closeId, folio,
                $"{order.Folio} cierre {sequence}");
    }

    /// <summary>
    /// RN-61: real consumption per order line, by default the theoretical (RN-11) for what this close produced. A close
    /// with no production consumes nothing (RN-63). Chosen lots must add up to the real quantity.
    /// </summary>
    private static List<CloseConsumption> PlanConsumption(ProductionOrder order, Recipe recipe, CreateProductionCloseRequest request)
    {
        var inputs = (request.Lines ?? []).ToDictionary(l => l.ComponentItemId);
        if (inputs.Keys.Any(id => order.Lines.All(l => l.ComponentItemId != id)))
            throw new BusinessRuleException("production_close_unknown_component", "Un componente indicado no pertenece a la orden.");

        return order.Lines.Select(line =>
        {
            var recipeLine = recipe.Lines.Single(r => r.ComponentItemId == line.ComponentItemId);
            var theoretical = request.ProducedQty == 0
                ? 0
                : RecipeRules.Theoretical(request.ProducedQty, recipe.YieldQty, recipeLine.Quantity, recipeLine.WastePct);
            inputs.TryGetValue(line.ComponentItemId, out var input);
            var actual = input?.ActualQty ?? theoretical;
            var chosen = input?.Lots ?? [];

            if (request.ProducedQty == 0 && actual > 0)
                throw new BusinessRuleException("production_close_without_output",
                    "Un cierre final sin producción no registra consumos: solo termina la orden.");
            if (chosen.Count > 0 && chosen.Sum(l => l.Qty) != actual)
                throw new BusinessRuleException("lots_mismatch", "La suma de los lotes elegidos debe ser igual al consumo real.");

            return new CloseConsumption(line.ComponentItemId, theoretical, actual, 0, chosen);
        }).ToList();
    }

    public async Task<IReadOnlyList<ProductionCloseListItemDto>> ListByOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        await FindAsync(orderId, tracked: false, ct);
        var page = await ListAsync(new ProductionCloseListQuery { ProductionOrderId = orderId, PageSize = PageQuery.MaxPageSize, Sort = "closedAt" }, ct);
        return page.Items;
    }

    public async Task<PagedResult<ProductionCloseListItemDto>> ListAsync(ProductionCloseListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var rows = from c in db.ProductionCloses.AsNoTracking()
                   join o in db.ProductionOrders on c.ProductionOrderId equals o.Id
                   where allowed.Contains(o.LocationId)
                   select new { Close = c, Order = o };
        if (query.LocationId is { } locationId)
            rows = rows.Where(x => x.Order.LocationId == locationId);
        if (query.From is { } from)
            rows = rows.Where(x => x.Close.BusinessDate >= from);
        if (query.To is { } to)
            rows = rows.Where(x => x.Close.BusinessDate <= to);
        if (query.FactoryId is { } factoryId)
            rows = rows.Where(x => db.Recipes.Any(r => r.Id == x.Order.RecipeId && r.FactoryId == factoryId));
        if (query.ItemId is { } itemId)
            rows = rows.Where(x => x.Order.OutputItemId == itemId);
        if (query.ProductionOrderId is { } orderId)
            rows = rows.Where(x => x.Order.Id == orderId);
        if (query.Kind is { } kind)
            rows = rows.Where(x => x.Close.Kind == kind);
        if (query.SearchTerm() is { } term)
            rows = rows.Where(x => x.Close.Folio.ToLower().Contains(term) || x.Order.Folio.ToLower().Contains(term));

        var sort = (query.Sort ?? "closedAt:desc").Split(':', 2);
        var descending = sort.Length == 2 && sort[1].Equals("desc", StringComparison.OrdinalIgnoreCase);
        if (!SortColumns.ContainsKey(sort[0]))
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["sort"] = [$"No se puede ordenar por '{sort[0]}'. Opciones: {string.Join(", ", SortColumns.Keys)}."],
            });
        rows = (sort[0], descending) switch
        {
            ("businessDate", false) => rows.OrderBy(x => x.Close.BusinessDate).ThenBy(x => x.Close.ClosedAt),
            ("businessDate", true) => rows.OrderByDescending(x => x.Close.BusinessDate).ThenByDescending(x => x.Close.ClosedAt),
            ("folio", false) => rows.OrderBy(x => x.Close.Folio),
            ("folio", true) => rows.OrderByDescending(x => x.Close.Folio),
            (_, false) => rows.OrderBy(x => x.Close.ClosedAt),
            _ => rows.OrderByDescending(x => x.Close.ClosedAt),
        };

        var page = await rows.ToPagedResultAsync(query, ct);
        var closeIds = page.Items.Select(x => x.Close.Id).ToList();
        var lines = await db.ProductionCloses.AsNoTracking().Where(c => closeIds.Contains(c.Id))
            .SelectMany(c => c.Lines.Select(l => new { c.Id, l.WasteQty, l.UnitCost })).ToListAsync(ct);
        var wasteCost = lines.GroupBy(l => l.Id).ToDictionary(g => g.Key, g => InventoryMath.Round(g.Sum(l => l.WasteQty * l.UnitCost)));
        var names = await NamesAsync(page.Items.Select(x => x.Order.OutputItemId), page.Items.Select(x => x.Order.RecipeId),
            page.Items.Select(x => x.Close.OutputLotId), ct);
        var users = await userDirectory.GetNamesAsync(page.Items.Select(x => x.Close.ClosedBy), ct);

        return new PagedResult<ProductionCloseListItemDto>(page.Items.Select(x =>
        {
            var item = names.Items[x.Order.OutputItemId];
            var factory = names.Factories.GetValueOrDefault(x.Order.RecipeId);
            return new ProductionCloseListItemDto(x.Close.Id, x.Close.Folio, x.Close.BusinessDate, x.Close.ClosedAt, x.Order.Id, x.Order.Folio,
                x.Order.OutputItemId, item.Sku, item.Name, item.Uom, factory?.Id, factory?.Code, factory?.Name, x.Close.Shift, x.Close.Kind, x.Close.Sequence,
                x.Close.ProducedQty, x.Close.ExceedsTolerance, x.Close.OutputLotId is { } lot ? names.Lots[lot].LotNumber : null, x.Close.TotalCost, x.Close.UnitCost,
                wasteCost.GetValueOrDefault(x.Close.Id), users.Of(x.Close.ClosedBy), x.Close.OutputLotId);
        }).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<ProductionCloseDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var close = await db.ProductionCloses.AsNoTracking().Include(c => c.Lines).ThenInclude(l => l.Lots)
                        .SingleOrDefaultAsync(c => c.Id == id, ct)
                    ?? throw new NotFoundException("el cierre de producción", id);
        var order = await db.ProductionOrders.AsNoTracking().SingleAsync(o => o.Id == close.ProductionOrderId, ct);
        scope.EnsureAccess(order.LocationId);

        var lotIds = close.Lines.SelectMany(l => l.Lots.Select(x => (Guid?)x.LotId)).Append(close.OutputLotId);
        var names = await NamesAsync([order.OutputItemId], [order.RecipeId], lotIds, ct);
        var components = await ComponentsAsync(close.Lines.Select(l => l.ComponentItemId).ToList(), ct);
        var item = names.Items[order.OutputItemId];
        var users = await userDirectory.GetNamesAsync([close.ClosedBy], ct);
        var stockIds = close.Lines.Select(l => l.LocationId).Append(close.OutputLocationId).Distinct().ToList();
        var stockCodes = await db.Locations.AsNoTracking().Where(l => stockIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        var lines = close.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            return new ProductionCloseLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Uom, l.LocationId, stockCodes[l.LocationId],
                l.TheoreticalQty, l.ActualQty, l.WasteQty,
                l.UnitCost, InventoryMath.Round(l.ActualQty * l.UnitCost),
                l.Lots.Select(x => new ProductionCloseLotDto(x.LotId, names.Lots[x.LotId].LotNumber, names.Lots[x.LotId].ExpirationDate, x.Quantity))
                    .OrderBy(x => x.ExpirationDate).ToList());
        }).OrderBy(l => l.Sku).ToList();

        var outputLot = close.OutputLotId is { } lotId ? names.Lots[lotId] : null;
        var factory = names.Factories.GetValueOrDefault(order.RecipeId);
        return new ProductionCloseDto(close.Id, close.Folio, order.Id, order.Folio, close.Sequence, close.Kind, close.BusinessDate, close.Shift,
            order.OutputItemId, item.Sku, item.Name, item.Uom, factory?.Id, factory?.Code, factory?.Name, close.ProducedQty, close.ExceedsTolerance,
            close.OutputLocationId, stockCodes[close.OutputLocationId], close.OutputLotId, outputLot?.LotNumber, outputLot?.ExpirationDate, close.TotalCost, close.UnitCost, close.WasteQty, close.WasteCost,
            close.ClosedAt, close.ClosedBy, users.Of(close.ClosedBy), close.Notes, lines);
    }

    private async Task<ProductionOrder> FindAsync(Guid orderId, bool tracked, CancellationToken ct)
    {
        var query = tracked ? db.ProductionOrders : db.ProductionOrders.AsNoTracking();
        var order = await query.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == orderId, ct)
                    ?? throw new NotFoundException("la orden de producción", orderId);
        scope.EnsureAccess(order.LocationId);
        return order;
    }

    private sealed record ItemName(string Sku, string Name, string Uom, bool TracksLots);

    private sealed record LotName(string LotNumber, DateOnly? ExpirationDate);

    private sealed record FactoryName(Guid Id, string Code, string Name);

    /// <param name="Factories">Recipe → its factory (RN-49); recipes without one are missing.</param>
    private sealed record Names(Dictionary<Guid, ItemName> Items, Dictionary<Guid, FactoryName> Factories, Dictionary<Guid, LotName> Lots);

    private async Task<Dictionary<Guid, ItemName>> ComponentsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        await (from i in db.Items.AsNoTracking()
               join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
               where ids.Contains(i.Id)
               select new { i.Id, Name = new ItemName(i.Sku, i.Name, u.Code, i.TracksLots) }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);

    private async Task<Names> NamesAsync(IEnumerable<Guid> itemIds, IEnumerable<Guid> recipeIds, IEnumerable<Guid?> lotIds, CancellationToken ct)
    {
        var items = await ComponentsAsync(itemIds.Distinct().ToList(), ct);
        var recipeList = recipeIds.Distinct().ToList();
        var factories = await (from r in db.Recipes.AsNoTracking()
                               where recipeList.Contains(r.Id)
                               join f in db.Locations on r.FactoryId equals f.Id
                               select new { r.Id, Factory = new FactoryName(f.Id, f.Code, f.Name) }).ToDictionaryAsync(x => x.Id, x => x.Factory, ct);
        var lotList = lotIds.OfType<Guid>().Distinct().ToList();
        var lotNames = await db.Lots.AsNoTracking().Where(l => lotList.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new LotName(l.LotNumber, l.ExpirationDate), ct);
        return new Names(items, factories, lotNames);
    }
}
