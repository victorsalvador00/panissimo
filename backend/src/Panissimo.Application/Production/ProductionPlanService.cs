using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Production;

public sealed record ProductionPlanQuery
{
    public Guid LocationId { get; init; }

    /// <summary>Default: today.</summary>
    public DateOnly? From { get; init; }

    /// <summary>Default: from + production.plan_default_days.</summary>
    public DateOnly? To { get; init; }

    /// <summary>RN-49: the factory of the product's active recipe.</summary>
    public Guid? FactoryId { get; init; }

    /// <summary>SKU or name (contains).</summary>
    public string? Q { get; init; }
}

public sealed record PlanDemandLineDto(
    DemandType Type, Guid LineId, Guid DocumentId, string Folio, string PartyName, DateOnly RequiredDate, decimal Quantity);

/// <param name="Stock">Projected stock at the start of the day.</param>
/// <param name="OpenOrders">Pending of open OPs that cover from this day.</param>
/// <param name="SuggestedQty">To produce (RN-70), rounded up to the production multiple.</param>
/// <param name="FactoryId">RN-49: the factory of the product's active recipe.</param>
public sealed record ProductionPlanRowDto(
    Guid ItemId, string Sku, string Name, ItemType Type, ItemPresentation? Presentation, Guid? FactoryId, string? FactoryCode, string? FactoryName, string UomCode,
    decimal ProductionMultiple, bool HasActiveRecipe, DateOnly Date, decimal BranchOrders, decimal CustomerOrders,
    decimal StockReplenishment, decimal ParentOrders, decimal TotalDemand, decimal Stock, decimal OpenOrders, decimal SuggestedQty,
    IReadOnlyList<PlanDemandLineDto> DemandLines, long? PhotoRevision = null);

public sealed record ProductionPlanDto(Guid LocationId, DateOnly From, DateOnly To, IReadOnlyList<ProductionPlanRowDto> Rows);

/// <param name="DemandLineIds">Order lines this OP serves; null = the pending order lines of the product up to the date.</param>
public sealed record GeneratePlanLineRequest(Guid ItemId, DateOnly Date, Shift? Shift, decimal Quantity, IReadOnlyList<Guid>? DemandLineIds);

public sealed record GenerateProductionPlanRequest(Guid LocationId, IReadOnlyList<GeneratePlanLineRequest> Lines);

public sealed record GeneratedProductionOrderDto(
    Guid Id, string Folio, Guid ItemId, string Sku, DateOnly ScheduledDate, Shift? Shift, decimal PlannedQty,
    int LinkedLines);

public sealed record GenerateProductionPlanResult(IReadOnlyList<GeneratedProductionOrderDto> Orders);

public sealed class GenerateProductionPlanRequestValidator : AbstractValidator<GenerateProductionPlanRequest>
{
    public const int MaxLines = 1000;

    public GenerateProductionPlanRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithName("Ubicación");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Elige al menos un renglón del plan.")
            .Must(l => l.Count <= MaxLines).WithMessage($"Genera máximo {MaxLines} renglones a la vez.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
            line.RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
            line.RuleFor(l => l.Shift).IsInEnum().WithName("Turno");
        });
    }
}

/// <summary>A source of demand for the production plan (backend §6), so sources can be added by phases.</summary>
public interface IDemandSource
{
    /// <summary>Pending demand at the plant required up to <paramref name="to"/> (earlier dates count on the first day).</summary>
    Task<IReadOnlyList<PlanDemand>> LoadAsync(Guid locationId, DateOnly to, CancellationToken ct);
}

/// <summary>Branch orders: Submitted (requested) or Approved (approved − dispatched), by RequiredDate.</summary>
public sealed class BranchOrderDemandSource(IAppDbContext db) : IDemandSource
{
    public async Task<IReadOnlyList<PlanDemand>> LoadAsync(Guid locationId, DateOnly to, CancellationToken ct) =>
        (await (from o in db.BranchOrders.AsNoTracking()
                from l in o.Lines
                join b in db.Locations on o.RequestingLocationId equals b.Id
                where o.SupplyingLocationId == locationId && o.RequiredDate <= to
                      && (o.Status == BranchOrderStatus.Submitted || o.Status == BranchOrderStatus.Approved)
                select new
                {
                    l.ItemId, l.Id, OrderId = o.Id, o.Folio, b.Name, o.RequiredDate,
                    Qty = o.Status == BranchOrderStatus.Submitted ? l.RequestedQty : (l.ApprovedQty ?? 0) - l.ShippedQty,
                })
            .ToListAsync(ct))
        .Where(x => x.Qty > 0)
        .Select(x => new PlanDemand(x.ItemId, DemandType.BranchOrderLine, x.Id, x.OrderId, x.Folio, x.Name, x.RequiredDate, x.Qty))
        .ToList();
}

/// <summary>Customer orders: Confirmed or PartiallyShipped (quantity − shipped), by RequiredDate.</summary>
public sealed class CustomerOrderDemandSource(IAppDbContext db) : IDemandSource
{
    public async Task<IReadOnlyList<PlanDemand>> LoadAsync(Guid locationId, DateOnly to, CancellationToken ct) =>
        (await (from o in db.CustomerOrders.AsNoTracking()
                from l in o.Lines
                join c in db.Customers on o.CustomerId equals c.Id
                where o.SupplyingLocationId == locationId && o.RequiredDate <= to
                      && (o.Status == CustomerOrderStatus.Confirmed || o.Status == CustomerOrderStatus.PartiallyShipped)
                select new { l.ItemId, l.Id, OrderId = o.Id, o.Folio, c.Name, o.RequiredDate, Qty = l.Quantity - l.ShippedQty })
            .ToListAsync(ct))
        .Where(x => x.Qty > 0)
        .Select(x => new PlanDemand(x.ItemId, DemandType.CustomerOrderLine, x.Id, x.OrderId, x.Folio, x.Name, x.RequiredDate, x.Qty))
        .ToList();
}

/// <summary>
/// Semi-finished goods and bulk goods packed into a packaged one (RN-119): RN-11 on what is still to be produced of the open
/// OPs that use them, by ScheduledDate.
/// </summary>
public sealed class ParentOrderDemandSource(IAppDbContext db) : IDemandSource
{
    public async Task<IReadOnlyList<PlanDemand>> LoadAsync(Guid locationId, DateOnly to, CancellationToken ct) =>
        (await (from o in db.ProductionOrders.AsNoTracking()
                from l in o.Lines
                join c in db.Items on l.ComponentItemId equals c.Id
                join p in db.Items on o.OutputItemId equals p.Id
                where o.LocationId == locationId && o.ScheduledDate <= to && (c.Type == ItemType.SemiFinished || c.Type == ItemType.FinishedGood)
                      && (o.Status == ProductionOrderStatus.Draft || o.Status == ProductionOrderStatus.Released
                          || o.Status == ProductionOrderStatus.InProgress)
                      && o.PlannedQty > o.ProducedQty
                select new { l.ComponentItemId, l.Id, OrderId = o.Id, o.Folio, p.Name, o.ScheduledDate, l.TheoreticalQty, o.PlannedQty, o.ProducedQty })
            .ToListAsync(ct))
        .Select(x => new PlanDemand(x.ComponentItemId, DemandType.ParentOrder, x.Id, x.OrderId, x.Folio, x.Name, x.ScheduledDate,
            InventoryMath.Round(x.TheoreticalQty * (x.PlannedQty - x.ProducedQty) / x.PlannedQty)))
        .Where(d => d.Quantity > 0)
        .ToList();
}

public interface IProductionPlanService
{
    /// <summary>RN-70: a query; it saves and reserves nothing.</summary>
    Task<ProductionPlanDto> GetAsync(ProductionPlanQuery query, CancellationToken ct = default);

    /// <summary>RN-71: one draft OP per product, date and shift, linked to the order lines it serves. All or nothing.</summary>
    Task<GenerateProductionPlanResult> GenerateAsync(GenerateProductionPlanRequest request, CancellationToken ct = default);
}

public sealed class ProductionPlanService(
    IAppDbContext db,
    ILocationScope scope,
    IClock clock,
    IEnumerable<IDemandSource> demandSources,
    IProductionOrderService orders) : IProductionPlanService
{
    public const int MaxRangeDays = 31;

    private sealed record PlanItem(
        Guid Id, string Sku, string Name, ItemType Type, ItemPresentation? Presentation, string Uom, decimal Multiple);

    public async Task<ProductionPlanDto> GetAsync(ProductionPlanQuery query, CancellationToken ct = default)
    {
        await EnsurePlantAsync(query.LocationId, ct);
        var today = clock.BusinessDate();
        var from = query.From ?? today;
        var to = query.To ?? from.AddDays((int)await db.GetSettingAsync(AppSettingKeys.PlanDefaultDays, ct));
        if (from < today)
            throw new BusinessRuleException("plan_range_past", "El plan empieza hoy o después (RN-70).");
        if (to < from || to.DayNumber - from.DayNumber >= MaxRangeDays)
            throw new BusinessRuleException("plan_range_invalid", $"El rango del plan va de 1 a {MaxRangeDays} días.");

        var demands = new List<PlanDemand>();
        foreach (var source in demandSources)
            demands.AddRange(await source.LoadAsync(query.LocationId, to, ct));
        var supplies = await (from o in db.ProductionOrders.AsNoTracking()
                              where o.LocationId == query.LocationId && o.ScheduledDate <= to && o.PlannedQty > o.ProducedQty
                                    && (o.Status == ProductionOrderStatus.Draft || o.Status == ProductionOrderStatus.Released
                                        || o.Status == ProductionOrderStatus.InProgress)
                              select new PlanSupply(o.OutputItemId, o.ScheduledDate, o.PlannedQty - o.ProducedQty))
            .ToListAsync(ct);
        var settings = await db.ItemLocationSettings.AsNoTracking().Where(s => s.LocationId == query.LocationId)
            .ToDictionaryAsync(s => s.ItemId, ct);

        // RN-70 candidates: produced items with demand, a configured minimum or open OPs.
        var candidateIds = demands.Select(d => d.ItemId).Concat(supplies.Select(s => s.ItemId)).Concat(settings.Keys).Distinct().ToList();
        var produced = db.Items.AsNoTracking()
            .Where(i => candidateIds.Contains(i.Id) && i.IsActive && (i.Type == ItemType.FinishedGood || i.Type == ItemType.SemiFinished));
        if (query.FactoryId is { } onlyFactory)
            produced = produced.Where(i => db.Recipes.Any(r => r.OutputItemId == i.Id && r.IsActive && r.FactoryId == onlyFactory));
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var term = query.Q.Trim().ToLower();
            produced = produced.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term));
        }
        var items = await (from i in produced
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           select new PlanItem(i.Id, i.Sku, i.Name, i.Type, i.Presentation, u.Code, i.ProductionMultiple))
            .ToListAsync(ct);
        var itemIds = items.Select(i => i.Id).ToList();

        var stock = await RecipeService.UsableStockAsync(db, query.LocationId, itemIds, today, ct);
        var activeRecipes = await db.Recipes.AsNoTracking().Where(r => r.IsActive && itemIds.Contains(r.OutputItemId))
            .ToDictionaryAsync(r => r.OutputItemId, r => r.FactoryId, ct);
        var factoryIds = activeRecipes.Values.OfType<Guid>().Distinct().ToList();
        var factories = await db.Locations.AsNoTracking().Where(l => factoryIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new { l.Code, l.Name }, ct);
        var photos = await db.ItemPhotos.AsNoTracking().Where(p => itemIds.Contains(p.ItemId)).Select(p => new { p.ItemId, p.Revision }).ToDictionaryAsync(p => p.ItemId, p => p.Revision, ct);
        var demandsByItem = demands.ToLookup(d => d.ItemId);
        var suppliesByItem = supplies.ToLookup(s => s.ItemId);

        var rows = new List<ProductionPlanRowDto>();
        foreach (var item in items)
        {
            settings.TryGetValue(item.Id, out var setting);
            var input = new PlanItemInput(item.Id, stock.GetValueOrDefault(item.Id), item.Multiple, item.Uom == UnitOfMeasure.PieceCode,
                setting?.MinQty, setting?.MaxQty, demandsByItem[item.Id].ToList(), suppliesByItem[item.Id].ToList());
            var hasRecipe = activeRecipes.TryGetValue(item.Id, out var factoryId);
            var factory = factoryId is { } f ? factories[f] : null;
            foreach (var day in ProductionPlanCalculator.Calculate(input, from, to))
                rows.Add(new ProductionPlanRowDto(item.Id, item.Sku, item.Name, item.Type, item.Presentation,
                    factoryId, factory?.Code, factory?.Name, item.Uom, item.Multiple, hasRecipe, day.Date, day.BranchOrders,
                    day.CustomerOrders, day.StockReplenishment, day.ParentOrders, day.TotalDemand, day.StartingStock, day.OpenOrders,
                    day.SuggestedQty, day.DemandLines.Select(d => new PlanDemandLineDto(d.Type, d.SourceLineId, d.DocumentId, d.Folio,
                        d.PartyName, d.RequiredDate, d.Quantity)).ToList(), photos.TryGetValue(item.Id, out var revision) ? revision : null));
        }

        return new ProductionPlanDto(query.LocationId, from, to,
            rows.OrderBy(r => r.Date).ThenBy(r => r.FactoryCode is null).ThenBy(r => r.FactoryCode).ThenBy(r => r.Sku).ToList());
    }

    public async Task<GenerateProductionPlanResult> GenerateAsync(GenerateProductionPlanRequest request, CancellationToken ct = default)
    {
        await EnsurePlantAsync(request.LocationId, ct);
        var itemIds = request.Lines.Select(l => l.ItemId).Distinct().ToList();
        var skus = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Sku, ct);
        foreach (var id in itemIds.Where(id => !skus.ContainsKey(id)))
            throw new NotFoundException("el artículo", id);

        // Pending order lines that may be linked; parent OPs are never linked (RN-72), so the plan row may send them and
        // they are skipped.
        var lastDate = request.Lines.Max(l => l.Date);
        var demandLines = new List<PlanDemand>();
        var parentLineIds = new HashSet<Guid>();
        foreach (var source in demandSources)
            foreach (var demand in (await source.LoadAsync(request.LocationId, lastDate, ct)).Where(d => itemIds.Contains(d.ItemId)))
                if (demand.Type == DemandType.ParentOrder) parentLineIds.Add(demand.SourceLineId);
                else demandLines.Add(demand);
        var demandById = demandLines.ToDictionary(d => d.SourceLineId);

        // RN-71: one OP per product, date and shift.
        var groups = request.Lines
            .GroupBy(l => (l.ItemId, l.Date, l.Shift))
            .OrderBy(g => g.Key.Date).ThenBy(g => skus[g.Key.ItemId])
            .Select(g => new
            {
                g.Key,
                Quantity = g.Sum(l => l.Quantity),
                DemandIds = g.Any(l => l.DemandLineIds is not null)
                    ? g.SelectMany(l => l.DemandLineIds ?? []).Where(id => !parentLineIds.Contains(id)).Distinct().ToList()
                    : null,
            })
            .ToList();

        var links = new List<List<(PlanDemand Demand, decimal Quantity)>>();
        foreach (var group in groups)
        {
            List<PlanDemand> candidates;
            if (group.DemandIds is { } ids)
            {
                var unknown = ids.Where(id => !demandById.TryGetValue(id, out var d) || d.ItemId != group.Key.ItemId).ToList();
                if (unknown.Count > 0)
                    throw new RequestValidationException(new Dictionary<string, string[]>
                    {
                        ["lines"] = [$"Una línea de pedido indicada para {skus[group.Key.ItemId]} no es de ese producto o ya no está pendiente."],
                    });
                candidates = ids.Select(id => demandById[id]).ToList();
            }
            else
            {
                candidates = demandLines.Where(d => d.ItemId == group.Key.ItemId && d.RequiredDate <= group.Key.Date).ToList();
            }
            links.Add(Distribute(candidates, group.Quantity));
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var created = await orders.CreateManyInTransactionAsync(
            groups.Select(g => new CreateProductionOrderRequest(request.LocationId, g.Key.ItemId, g.Quantity, g.Key.Date, g.Key.Shift,
                null)).ToList(),
            ProductionOrderSource.Plan, null, ct);
        for (var i = 0; i < created.Count; i++)
            db.ProductionOrderDemands.AddRange(links[i].Select(l => new ProductionOrderDemand(created[i].Id, l.Demand.Type, l.Demand.SourceLineId, l.Quantity)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new GenerateProductionPlanResult(created.Select((o, i) => new GeneratedProductionOrderDto(o.Id, o.Folio, o.OutputItemId,
            skus[o.OutputItemId], o.ScheduledDate, o.Shift, o.PlannedQty, links[i].Count)).ToList());
    }

    /// <summary>RN-71: the OP quantity is spread over the order lines in RequiredDate order.</summary>
    private static List<(PlanDemand, decimal)> Distribute(IEnumerable<PlanDemand> candidates, decimal quantity)
    {
        var result = new List<(PlanDemand, decimal)>();
        var remaining = quantity;
        foreach (var demand in candidates.OrderBy(d => d.RequiredDate).ThenBy(d => d.Folio))
        {
            if (remaining <= 0)
                break;
            var take = Math.Min(remaining, demand.Quantity);
            result.Add((demand, take));
            remaining -= take;
        }
        return result;
    }

    /// <summary>The plan and its OPs belong to the plant, in the caller's scope.</summary>
    private async Task EnsurePlantAsync(Guid locationId, CancellationToken ct)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.CanProduce)
            throw new BusinessRuleException("production_plant_only", "El plan de producción es de la Planta (RN-70).");
    }
}
