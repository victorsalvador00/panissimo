using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

public enum RequirementStatus
{
    /// <summary>Raw material or supply short: buy it.</summary>
    ToBuy,

    /// <summary>Semi-finished good short: produce it with its own order (D-04).</summary>
    ToProduce,

    Covered,
}

public sealed record MaterialRequirementQuery
{
    public Guid LocationId { get; init; }

    /// <summary>Orders scheduled up to this date; default today + 7.</summary>
    public DateOnly? To { get; init; }
}

public sealed record RequirementOrderDto(Guid ProductionOrderId, string Folio, DateOnly ScheduledDate, string OutputSku, decimal Quantity);

/// <param name="Required">What the open orders still need (RN-11), in base unit.</param>
/// <param name="InTransitOrders">Pending of non-final purchase orders, in base unit.</param>
/// <param name="InTransitRequisitions">Draft, submitted or approved requisitions, in base unit.</param>
/// <param name="Shortage">required + min − usable stock − in transit, never negative (base unit).</param>
/// <param name="SuggestedPurchaseQty">Whole purchase units covering the shortage; only to buy.</param>
public sealed record MaterialRequirementRowDto(
    Guid ItemId, string Sku, string Name, ItemType Type, string BaseUomCode, string PurchaseUomCode, decimal PurchaseToBaseFactor,
    decimal Required, decimal MinQty, decimal Stock, decimal InTransitOrders, decimal InTransitRequisitions, decimal Shortage,
    decimal? SuggestedPurchaseQty, RequirementStatus Status, Guid? PreferredSupplierId, string? PreferredSupplierName,
    IReadOnlyList<RequirementOrderDto> Orders);

public sealed record MaterialRequirementDto(Guid LocationId, DateOnly To, IReadOnlyList<MaterialRequirementRowDto> Rows);

/// <param name="ItemIds">Only these items of the "to buy" rows; null = all of them.</param>
/// <param name="NeededBy">Default: the earliest date the items are needed (today at the earliest).</param>
public sealed record CreateSuggestedRequisitionRequest(Guid LocationId, DateOnly? To, DateOnly? NeededBy, IReadOnlyList<Guid>? ItemIds);

public sealed class CreateSuggestedRequisitionRequestValidator : AbstractValidator<CreateSuggestedRequisitionRequest>
{
    public CreateSuggestedRequisitionRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithName("Ubicación");
        RuleFor(x => x.ItemIds).Must(ids => ids is null || ids.Count > 0).WithMessage("Elige al menos un artículo o deja la lista vacía para todos.");
    }
}

public static class MaterialRequirementRules
{
    /// <summary>RN-50: shortage never negative.</summary>
    public static decimal Shortage(decimal required, decimal minQty, decimal stock, decimal inTransit) =>
        Math.Max(0, InventoryMath.Round(required + minQty - stock - inTransit));

    /// <summary>RN-50: whole purchase units, rounded up.</summary>
    public static decimal PurchaseUnits(decimal shortageBase, decimal purchaseToBaseFactor) =>
        shortageBase <= 0 ? 0 : decimal.Ceiling(shortageBase / purchaseToBaseFactor);
}

public interface IMaterialRequirementService
{
    /// <summary>RN-50 for the plant: a query, it saves and reserves nothing.</summary>
    Task<MaterialRequirementDto> GetAsync(MaterialRequirementQuery query, CancellationToken ct = default);

    /// <summary>RN-50: a normal draft requisition with the "to buy" rows (whole purchase units, preferred supplier).</summary>
    Task<RequisitionDto> CreateSuggestedRequisitionAsync(CreateSuggestedRequisitionRequest request, CancellationToken ct = default);
}

public sealed class MaterialRequirementService(IAppDbContext db, ILocationScope scope, IClock clock, IRequisitionService requisitions)
    : IMaterialRequirementService
{
    public const int DefaultDays = 7;

    public async Task<MaterialRequirementDto> GetAsync(MaterialRequirementQuery query, CancellationToken ct = default)
    {
        await EnsurePlantAsync(query.LocationId, ct);
        var today = clock.BusinessDate();
        var to = query.To ?? today.AddDays(DefaultDays);

        // What the open orders still need of each component: RN-11 on their pending quantity.
        var demand = await (from o in db.ProductionOrders.AsNoTracking()
                            from l in o.Lines
                            join p in db.Items on o.OutputItemId equals p.Id
                            where o.LocationId == query.LocationId && o.ScheduledDate <= to && o.PlannedQty > o.ProducedQty
                                  && (o.Status == ProductionOrderStatus.Draft || o.Status == ProductionOrderStatus.Released
                                      || o.Status == ProductionOrderStatus.InProgress)
                            select new { l.ComponentItemId, OrderId = o.Id, o.Folio, o.ScheduledDate, p.Sku, l.TheoreticalQty, o.PlannedQty, o.ProducedQty })
            .ToListAsync(ct);
        var needs = demand
            .Select(d => new { d.ComponentItemId, Order = new RequirementOrderDto(d.OrderId, d.Folio, d.ScheduledDate, d.Sku,
                InventoryMath.Round(d.TheoreticalQty * (d.PlannedQty - d.ProducedQty) / d.PlannedQty)) })
            .Where(d => d.Order.Quantity > 0)
            .ToLookup(d => d.ComponentItemId, d => d.Order);
        var itemIds = needs.Select(g => g.Key).ToList();

        var items = await (from i in db.Items.AsNoTracking()
                           join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                           join p in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals p.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, BaseUom = b.Code, PurchaseUom = p.Code })
            .ToDictionaryAsync(x => x.Item.Id, ct);
        var mins = await db.ItemLocationSettings.AsNoTracking().Where(s => s.LocationId == query.LocationId && itemIds.Contains(s.ItemId))
            .ToDictionaryAsync(s => s.ItemId, s => s.MinQty, ct);
        var stock = await RecipeService.UsableStockAsync(db, query.LocationId, itemIds, today, ct);

        // In transit (base unit): pending of non-final purchase orders and open requisitions, both in purchase units.
        var ordered = await (from o in db.PurchaseOrders.AsNoTracking()
                             from l in o.Lines
                             where o.DeliveryLocationId == query.LocationId && itemIds.Contains(l.ItemId) && l.Quantity > l.ReceivedQty
                                   && (o.Status == PurchaseOrderStatus.Draft || o.Status == PurchaseOrderStatus.PendingApproval
                                       || o.Status == PurchaseOrderStatus.Approved || o.Status == PurchaseOrderStatus.PartiallyReceived)
                             group l by l.ItemId into g
                             select new { g.Key, Qty = g.Sum(l => l.Quantity - l.ReceivedQty) })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var requested = await (from r in db.PurchaseRequisitions.AsNoTracking()
                               from l in r.Lines
                               where r.LocationId == query.LocationId && itemIds.Contains(l.ItemId)
                                     && (r.Status == RequisitionStatus.Draft || r.Status == RequisitionStatus.Submitted
                                         || r.Status == RequisitionStatus.Approved)
                               group l by l.ItemId into g
                               select new { g.Key, Qty = g.Sum(l => l.Quantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var preferred = await (from s in db.SupplierItems.AsNoTracking()
                               join sp in db.Suppliers on s.SupplierId equals sp.Id
                               where itemIds.Contains(s.ItemId) && s.IsPreferred && s.IsActive && sp.IsActive
                               select new { s.ItemId, sp.Id, sp.Name })
            .ToDictionaryAsync(x => x.ItemId, ct);

        var rows = new List<MaterialRequirementRowDto>();
        foreach (var itemId in itemIds)
        {
            var entry = items[itemId];
            var item = entry.Item;
            var factor = item.PurchaseToBaseFactor;
            var orders = needs[itemId].OrderBy(o => o.ScheduledDate).ThenBy(o => o.Folio).ToList();
            var required = orders.Sum(o => o.Quantity);
            var min = mins.GetValueOrDefault(itemId);
            var onHand = stock.GetValueOrDefault(itemId);
            var inOrders = InventoryMath.Round(ordered.GetValueOrDefault(itemId) * factor);
            var inRequisitions = InventoryMath.Round(requested.GetValueOrDefault(itemId) * factor);
            var shortage = MaterialRequirementRules.Shortage(required, min, onHand, inOrders + inRequisitions);

            var purchasable = SupplierRules.IsPurchasable(item.Type);
            var status = shortage == 0 ? RequirementStatus.Covered
                : purchasable ? RequirementStatus.ToBuy
                : RequirementStatus.ToProduce;
            var supplier = preferred.GetValueOrDefault(itemId);
            rows.Add(new MaterialRequirementRowDto(itemId, item.Sku, item.Name, item.Type, entry.BaseUom, entry.PurchaseUom, factor, required,
                min, onHand, inOrders, inRequisitions, shortage,
                status == RequirementStatus.ToBuy ? MaterialRequirementRules.PurchaseUnits(shortage, factor) : null, status,
                supplier?.Id, supplier?.Name, orders));
        }

        return new MaterialRequirementDto(query.LocationId, to,
            rows.OrderBy(r => r.Status).ThenBy(r => r.Orders.Min(o => o.ScheduledDate)).ThenBy(r => r.Sku).ToList());
    }

    public async Task<RequisitionDto> CreateSuggestedRequisitionAsync(CreateSuggestedRequisitionRequest request, CancellationToken ct = default)
    {
        var requirement = await GetAsync(new MaterialRequirementQuery { LocationId = request.LocationId, To = request.To }, ct);
        var toBuy = requirement.Rows.Where(r => r.Status == RequirementStatus.ToBuy
                                                && (request.ItemIds is null || request.ItemIds.Contains(r.ItemId))).ToList();
        if (toBuy.Count == 0)
            throw new BusinessRuleException("nothing_to_buy", "No hay materias primas ni insumos por comprar en el horizonte elegido (RN-50).");

        var today = clock.BusinessDate();
        var earliest = toBuy.Min(r => r.Orders.Min(o => o.ScheduledDate));
        var neededBy = request.NeededBy ?? (earliest < today ? today : earliest);
        // A normal draft requisition (RN-34): empty supplier takes the preferred one.
        return await requisitions.CreateAsync(new CreateRequisitionRequest(request.LocationId, neededBy,
            $"Requisición sugerida por el requerimiento de materia prima al {requirement.To:dd/MM/yyyy} (RN-50).",
            toBuy.Select(r => new RequisitionLineRequest(r.ItemId, r.SuggestedPurchaseQty!.Value, null)).ToList()), ct);
    }

    private async Task EnsurePlantAsync(Guid locationId, CancellationToken ct)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (location.Type != LocationType.Plant)
            throw new BusinessRuleException("requirement_plant_only", "El requerimiento de materia prima es de la Planta (RN-50).");
    }
}
