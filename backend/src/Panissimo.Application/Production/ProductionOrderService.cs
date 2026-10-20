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

/// <param name="Sources">RN-111: origin per component; a component not listed takes the default of its type.</param>
public sealed record CreateProductionOrderRequest(
    Guid LocationId, Guid OutputItemId, decimal PlannedQty, DateOnly ScheduledDate, Shift? Shift, string? Notes,
    IReadOnlyList<ComponentSourceRequest>? Sources = null);

/// <summary>Draft only (RN-60). Changing the product takes its active recipe.</summary>
public sealed record UpdateProductionOrderRequest(
    uint Version, Guid OutputItemId, decimal PlannedQty, DateOnly ScheduledDate, Shift? Shift, string? Notes,
    IReadOnlyList<ComponentSourceRequest>? Sources = null);

/// <summary>Tabs of the production orders screen (frontend §7.4).</summary>
public enum ProductionOrderTab
{
    ToProduce,
    InProgress,
    Drafts,
    All,
}

public sealed record ProductionOrderListQuery : PageQuery
{
    public ProductionOrderTab? Tab { get; init; }
    public ProductionOrderStatus? Status { get; init; }
    public Guid? LocationId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    /// <summary>RN-49: the factory of the order's recipe.</summary>
    public Guid? FactoryId { get; init; }
    public Shift? Shift { get; init; }
    public ProductionOrderSource? Source { get; init; }
    public Guid? ImportId { get; init; }
    public Guid? OutputItemId { get; init; }
}

public sealed record ProductionOrderListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid OutputItemId, string Sku, string ItemName, string BaseUomCode,
    int RecipeVersion, decimal PlannedQty, decimal ProducedQty, decimal ProgressPct, int CloseCount, DateOnly ScheduledDate,
    Guid? FactoryId, string? FactoryCode, string? FactoryName, Shift? Shift, ProductionOrderSource Source, Guid? ImportId,
    ProductionOrderStatus Status, DateTimeOffset CreatedAt);

/// <param name="Available">Usable stock at the plant while the order is open (RN-12); null once finished.</param>
/// <param name="Available">Draft with origin: free stock there (RN-110); otherwise usable stock where the close consumes.</param>
/// <param name="SourceLocationId">RN-111: sub-warehouse it comes from.</param>
public sealed record ProductionOrderLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, ItemType Type, string BaseUomCode, bool HasRecipe,
    decimal TheoreticalQty, decimal ActualQty, decimal? Available, decimal? Shortage, Guid? SourceLocationId = null,
    string? SourceLocationCode = null);

/// <summary>An order line the OP serves (RN-72, informative).</summary>
public sealed record ProductionOrderDemandDto(DemandType DemandType, Guid DemandLineId, Guid DocumentId, string Folio, string PartyName,
    DateOnly RequiredDate, decimal Quantity);

public sealed record ProductionOrderDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid RecipeId, int RecipeVersion, Guid OutputItemId, string Sku,
    string ItemName, string BaseUomCode, bool TracksLots, decimal PlannedQty, decimal ProducedQty, decimal PendingQty, decimal ProgressPct,
    decimal MaxAllowedQty, bool ExceedsTolerance, DateOnly ScheduledDate, Shift? Shift,
    ProductionOrderSource Source, Guid? ImportId, string? ImportFolio, string? Notes, ProductionOrderStatus Status,
    decimal TotalCost, decimal UnitCost, int CloseCount,
    DateTimeOffset? ReleasedAt, string? ReleasedByName, DateTimeOffset? CompletedAt, string? CompletedByName,
    ShortfallReason? ShortfallReason, string? ShortfallNotes, DateTimeOffset? CancelledAt,
    IReadOnlyList<ProductionOrderLineDto> Lines, IReadOnlyList<ProductionOrderDemandDto> Demands, DateTimeOffset CreatedAt,
    string? CreatedByName, uint Version, Guid? FactoryId = null, string? FactoryCode = null, string? FactoryName = null,
    IReadOnlyList<ProductionOrderVoucherDto>? Vouchers = null);

public sealed class CreateProductionOrderRequestValidator : AbstractValidator<CreateProductionOrderRequest>
{
    public CreateProductionOrderRequestValidator()
    {
        RuleFor(x => x.PlannedQty).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(x => x.Shift).IsInEnum().When(x => x.Shift is not null).WithName("Turno");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
    }
}

public sealed class UpdateProductionOrderRequestValidator : AbstractValidator<UpdateProductionOrderRequest>
{
    public UpdateProductionOrderRequestValidator()
    {
        RuleFor(x => x.PlannedQty).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(x => x.Shift).IsInEnum().When(x => x.Shift is not null).WithName("Turno");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
    }
}

public interface IProductionOrderService
{
    Task<PagedResult<ProductionOrderListItemDto>> ListAsync(ProductionOrderListQuery query, CancellationToken ct = default);
    Task<ProductionOrderDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<ProductionOrderDto> CreateAsync(CreateProductionOrderRequest request, CancellationToken ct = default);

    /// <summary>
    /// Builds a draft order (manual, plan or import) inside the caller's transaction; the caller saves and commits.
    /// Validates the plant, scope, product, active recipe and RN-03b; marks the recipe as used (RN-10).
    /// </summary>
    Task<ProductionOrder> CreateInTransactionAsync(CreateProductionOrderRequest request, ProductionOrderSource source, Guid? importId,
        CancellationToken ct = default);

    /// <summary>Same as <see cref="CreateInTransactionAsync"/> for many orders, loading products and recipes once (import, plan).</summary>
    Task<IReadOnlyList<ProductionOrder>> CreateManyInTransactionAsync(IReadOnlyList<CreateProductionOrderRequest> requests,
        ProductionOrderSource source, Guid? importId, CancellationToken ct = default);

    Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default);
    Task<ProductionOrderDto> ReleaseAsync(Guid id, uint version, CancellationToken ct = default);
    Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>
    /// RN-110/RN-112 inside the caller's transaction: releases a draft and, when its recipe has a factory, reserves each
    /// component at its origin and creates one ingredients voucher per origin to the factory.
    /// </summary>
    Task ReleaseInTransactionAsync(ProductionOrder order, CancellationToken ct = default);

    /// <summary>RN-111: the sub-warehouses each component of the recipe may come from, with free stock and the default.</summary>
    Task<IReadOnlyList<ComponentSourceOptionDto>> SourcesAsync(Guid locationId, Guid recipeId, CancellationToken ct = default);
}

public sealed class ProductionOrderService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IProductionOrderService
{
    private static readonly Dictionary<string, Expression<Func<ProductionOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["scheduledDate"] = o => o.ScheduledDate,
        ["createdAt"] = o => o.CreatedAt,
        ["status"] = o => o.Status,
    };

    public async Task<PagedResult<ProductionOrderListItemDto>> ListAsync(ProductionOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.ProductionOrders.AsNoTracking().Where(o => allowed.Contains(o.LocationId));
        orders = query.Tab switch
        {
            ProductionOrderTab.ToProduce => orders.Where(o => o.Status == ProductionOrderStatus.Released),
            ProductionOrderTab.InProgress => orders.Where(o => o.Status == ProductionOrderStatus.InProgress),
            ProductionOrderTab.Drafts => orders.Where(o => o.Status == ProductionOrderStatus.Draft),
            _ => orders,
        };
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.LocationId is { } locationId)
            orders = orders.Where(o => o.LocationId == locationId);
        if (query.From is { } from)
            orders = orders.Where(o => o.ScheduledDate >= from);
        if (query.To is { } to)
            orders = orders.Where(o => o.ScheduledDate <= to);
        if (query.FactoryId is { } factoryId)
            orders = orders.Where(o => db.Recipes.Any(r => r.Id == o.RecipeId && r.FactoryId == factoryId));
        if (query.Shift is { } shift)
            orders = orders.Where(o => o.Shift == shift);
        if (query.Source is { } source)
            orders = orders.Where(o => o.Source == source);
        if (query.ImportId is { } importId)
            orders = orders.Where(o => o.ImportId == importId);
        if (query.OutputItemId is { } itemId)
            orders = orders.Where(o => o.OutputItemId == itemId);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term)
                                       || db.Items.Any(i => i.Id == o.OutputItemId && (i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term))));

        var page = await orders.ApplySort(query.Sort, SortColumns, "scheduledDate:desc").ToPagedResultAsync(query, ct);

        var itemIds = page.Items.Select(o => o.OutputItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code }).ToDictionaryAsync(x => x.Id, ct);
        var recipeIds = page.Items.Select(o => o.RecipeId).Distinct().ToList();
        var recipes = await db.Recipes.AsNoTracking().Where(r => recipeIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => new { r.VersionNumber, r.FactoryId }, ct);
        var locationIds = page.Items.Select(o => o.LocationId)
            .Concat(recipes.Values.Select(r => r.FactoryId).OfType<Guid>()).Distinct().ToList();
        var locations = await db.Locations.AsNoTracking().Where(l => locationIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new { l.Code, l.Name }, ct);

        return new PagedResult<ProductionOrderListItemDto>(page.Items.Select(o =>
            {
                var recipe = recipes[o.RecipeId];
                var factory = recipe.FactoryId is { } f ? locations[f] : null;
                return new ProductionOrderListItemDto(o.Id, o.Folio, o.LocationId, locations[o.LocationId].Code, o.OutputItemId,
                    items[o.OutputItemId].Sku, items[o.OutputItemId].Name, items[o.OutputItemId].Uom, recipe.VersionNumber, o.PlannedQty,
                    o.ProducedQty, ProgressPct(o), o.CloseCount, o.ScheduledDate, recipe.FactoryId, factory?.Code, factory?.Name, o.Shift,
                    o.Source, o.ImportId, o.Status, o.CreatedAt);
            }).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<ProductionOrderDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<ProductionOrderDto> CreateAsync(CreateProductionOrderRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var order = await CreateInTransactionAsync(request, ProductionOrderSource.Manual, null, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrder> CreateInTransactionAsync(CreateProductionOrderRequest request, ProductionOrderSource source,
        Guid? importId, CancellationToken ct = default) =>
        (await CreateManyInTransactionAsync([request], source, importId, ct))[0];

    public async Task<IReadOnlyList<ProductionOrder>> CreateManyInTransactionAsync(IReadOnlyList<CreateProductionOrderRequest> requests,
        ProductionOrderSource source, Guid? importId, CancellationToken ct = default)
    {
        foreach (var locationId in requests.Select(r => r.LocationId).Distinct())
            await EnsurePlantAsync(locationId, ct);

        var catalogs = await LoadPlanCatalogsAsync(requests.Select(r => r.OutputItemId), ct);
        var sources = await ComponentSources.LoadAsync(db, requests.Select(r => r.LocationId),
            catalogs.ActiveRecipes.Values.SelectMany(rc => rc.Lines.Select(l => l.ComponentItemId)), ct);
        var numbers = await folios.NextManyAsync(DocType.ProductionOrder, requests.Count, ct);
        var today = clock.BusinessDate();
        var created = new List<ProductionOrder>(requests.Count);
        var checkedFloors = new HashSet<(Guid, Guid?)>();
        for (var i = 0; i < requests.Count; i++)
        {
            var r = requests[i];
            var plan = BuildPlan(catalogs, r.OutputItemId, r.PlannedQty, r.ScheduledDate, r.Shift, r.Notes);
            plan = plan with { Sources = sources.Resolve(r.LocationId, plan.Recipe, r.Sources) };
            // RN-49, checked once per plant and factory (an import brings up to 3,000 rows).
            if (checkedFloors.Add((r.LocationId, plan.Recipe.FactoryId)))
                await ProductionFloor.EnsureAsync(db, r.LocationId, plan.Recipe.FactoryId, catalogs.Items[r.OutputItemId].Sku, ct);
            var order = new ProductionOrder(numbers[i], r.LocationId, plan, source, importId, today);
            plan.Recipe.MarkUsed();
            db.ProductionOrders.Add(order);
            created.Add(order);
        }
        return created;
    }

    public async Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        var plan = await BuildPlanAsync(request.OutputItemId, request.PlannedQty, request.ScheduledDate, request.Shift, request.Notes, ct);

        var sku = await db.Items.Where(i => i.Id == plan.Recipe.OutputItemId).Select(i => i.Sku).SingleAsync(ct);
        var sources = await ComponentSources.LoadAsync(db, [order.LocationId], plan.Recipe.Lines.Select(l => l.ComponentItemId), ct);
        plan = plan with { Sources = sources.Resolve(order.LocationId, plan.Recipe, request.Sources) };
        await ProductionFloor.EnsureAsync(db, order.LocationId, plan.Recipe.FactoryId, sku, ct);
        order.UpdateDraft(plan, clock.BusinessDate());
        plan.Recipe.MarkUsed();
        db.Entry(order).State = EntityState.Modified; // line-only edits still bump the version
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> ReleaseAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        // The recipe may have been replaced since the draft was created: a draft is released with its own version.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        db.Entry(order).State = EntityState.Modified; // claims the row with its version first (RN-66 style)
        await db.SaveChangesAsync(ct);
        await ReleaseInTransactionAsync(order, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task ReleaseInTransactionAsync(ProductionOrder order, CancellationToken ct = default)
    {
        var recipe = await db.Recipes.AsNoTracking().SingleAsync(r => r.Id == order.RecipeId, ct);
        var outputSku = await db.Items.AsNoTracking().Where(i => i.Id == order.OutputItemId).Select(i => i.Sku).SingleAsync(ct);
        var floor = await ProductionFloor.EnsureAsync(db, order.LocationId, recipe.FactoryId, outputSku, ct);
        if (floor is null)
        {
            // Without a factory there is nothing to bring: the close consumes where it is (RN-45).
            order.Release(clock.UtcNow, currentUser.UserId);
            return;
        }

        // RN-111: every component needs its origin; the ones without one take the default of their type.
        var componentIds = order.Lines.Select(l => l.ComponentItemId).ToList();
        var sources = await ComponentSources.LoadAsync(db, [order.LocationId], componentIds, ct);
        order.AssignMissingSources(component => sources.DefaultFor(order.LocationId, component));
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where componentIds.Contains(i.Id)
                           select new { i.Id, i.Sku, IsPiece = u.Code == UnitOfMeasure.PieceCode, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var withoutSource = order.Lines
            .Where(l => l.SourceLocationId is not { } s || !sources.IsSourceOf(order.LocationId, l.ComponentItemId, s))
            .Select(l => items[l.ComponentItemId].Sku).Order().ToList();
        if (withoutSource.Count > 0)
            throw new BusinessRuleException("production_source_required",
                $"Elige el origen activo de {string.Join(", ", withoutSource)} antes de liberar la orden (RN-111).");

        // RN-110: what is asked for (whole pieces) must be free at its origin; the rows stay locked until commit.
        var needs = order.Lines.Where(l => l.TheoreticalQty > 0)
            .Select(l => (LocationId: l.SourceLocationId!.Value, ItemId: l.ComponentItemId,
                Needed: items[l.ComponentItemId].IsPiece ? Math.Ceiling(l.TheoreticalQty) : l.TheoreticalQty))
            .ToList();
        await posting.LockAsync(needs.Select(n => (n.LocationId, n.ItemId)), ct);
        var free = await FreeStockAsync(needs.Select(n => (n.LocationId, n.ItemId)).ToList(), null, ct);
        var shortages = StockReservationRules.Shortages(needs, (location, item) => free.GetValueOrDefault((location, item)));
        if (shortages.Count > 0)
        {
            var codes = await db.Locations.AsNoTracking().Where(l => shortages.Select(s => s.LocationId).Contains(l.Id))
                .ToDictionaryAsync(l => l.Id, l => l.Code, ct);
            throw new BusinessRuleException("release_insufficient_stock",
                "No hay existencia libre para liberar la orden (RN-110): " + string.Join("; ", shortages.Select(s =>
                    $"{items[s.ItemId].Sku} en {codes[s.LocationId]} necesita {s.Needed:0.####} {items[s.ItemId].Uom} y hay {s.Free:0.####} libres")) + ".");
        }

        // RN-112: one ingredients voucher per origin, to the recipe's factory; each line reserved until it is sent. What is
        // already at the recipe's factory needs no voucher: it stays reserved until the closes consume it (RN-111).
        var now = clock.UtcNow;
        db.StockReservations.AddRange(needs.Where(n => n.LocationId == floor.Id)
            .Select(n => new StockReservation(n.LocationId, n.ItemId, n.Needed, order.Id, null, now)));
        foreach (var group in needs.Where(n => n.LocationId != floor.Id).GroupBy(n => n.LocationId).OrderBy(g => g.Key))
        {
            var voucher = Transfer.ForProductionOrder(await folios.NextAsync(DocType.InternalTransfer, ct), group.Key, floor.Id, order.Id, order.Folio,
                group.Select(n => new TransferLineInput(n.ItemId, null, n.Needed)).ToList());
            db.Transfers.Add(voucher);
            db.StockReservations.AddRange(group.Select(n => new StockReservation(n.LocationId, n.ItemId, n.Needed, order.Id, voucher.Id, now)));
        }
        order.Release(now, currentUser.UserId);
    }

    public async Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        order.Cancel(clock.UtcNow);
        // RN-112: its vouchers still in draft are cancelled and free their reservations; sent ones already moved stock.
        foreach (var voucher in await db.Transfers.Where(t => t.ProductionOrderId == order.Id && t.Status == TransferStatus.Draft).ToListAsync(ct))
            voucher.Cancel();
        db.StockReservations.RemoveRange(await db.StockReservations.Where(r => r.ProductionOrderId == order.Id).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<IReadOnlyList<ComponentSourceOptionDto>> SourcesAsync(Guid locationId, Guid recipeId, CancellationToken ct = default)
    {
        await EnsurePlantAsync(locationId, ct);
        var recipe = await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == recipeId, ct)
                     ?? throw new NotFoundException("la receta", recipeId);
        var componentIds = recipe.Lines.Select(l => l.ComponentItemId).ToList();
        var sources = await ComponentSources.LoadAsync(db, [locationId], componentIds, ct);
        var options = componentIds.SelectMany(c => sources.OptionsFor(locationId, c).Select(l => (Component: c, Location: l))).ToList();
        var free = await FreeStockAsync(options.Select(o => (o.Location.Id, o.Component)).ToList(), null, ct);
        return options.Select(o => new ComponentSourceOptionDto(o.Component, o.Location.Id, o.Location.Code, o.Location.Name,
                free.GetValueOrDefault((o.Location.Id, o.Component)), sources.DefaultFor(locationId, o.Component) == o.Location.Id))
            .ToList();
    }

    /// <summary>RN-110: usable stock (expired lots excluded) minus what is reserved, per (location, item).</summary>
    /// <param name="exceptOrderId">Reservations of this order do not count (its own lines).</param>
    private async Task<Dictionary<(Guid, Guid), decimal>> FreeStockAsync(IReadOnlyList<(Guid LocationId, Guid ItemId)> pairs, Guid? exceptOrderId,
        CancellationToken ct)
    {
        var result = new Dictionary<(Guid, Guid), decimal>();
        if (pairs.Count == 0)
            return result;
        var today = clock.BusinessDate();
        var locationIds = pairs.Select(p => p.LocationId).Distinct().ToList();
        var itemIds = pairs.Select(p => p.ItemId).Distinct().ToList();
        var usable = await (from b in db.StockBalances.AsNoTracking()
                            where locationIds.Contains(b.LocationId) && itemIds.Contains(b.ItemId) && b.Quantity > 0
                            join l in db.Lots on b.LotId equals l.Id into lots
                            from l in lots.DefaultIfEmpty()
                            where l == null || l.ExpirationDate == null || l.ExpirationDate >= today
                            group b by new { b.LocationId, b.ItemId } into g
                            select new { g.Key.LocationId, g.Key.ItemId, Qty = g.Sum(b => b.Quantity) })
            .ToDictionaryAsync(x => (x.LocationId, x.ItemId), x => x.Qty, ct);
        var reserved = await db.StockReservations.AsNoTracking()
            .Where(r => locationIds.Contains(r.LocationId) && itemIds.Contains(r.ItemId) && r.ProductionOrderId != exceptOrderId)
            .GroupBy(r => new { r.LocationId, r.ItemId })
            .Select(g => new { g.Key.LocationId, g.Key.ItemId, Qty = g.Sum(r => r.Quantity) })
            .ToDictionaryAsync(x => (x.LocationId, x.ItemId), x => x.Qty, ct);
        foreach (var pair in pairs.Distinct())
            result[pair] = StockReservationRules.Free(usable.GetValueOrDefault(pair), reserved.GetValueOrDefault(pair));
        return result;
    }

    /// <summary>RN-14: production only at the plant, in the caller's scope.</summary>
    private async Task EnsurePlantAsync(Guid locationId, CancellationToken ct)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.CanProduce)
            throw new BusinessRuleException("production_plant_only", "Solo se produce en la Planta (RN-14).");
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
    }

    private sealed record PlanItem(string Sku, ItemType Type, bool IsActive, string Uom);

    private sealed record PlanCatalogs(
        IReadOnlyDictionary<Guid, PlanItem> Items, IReadOnlyDictionary<Guid, Recipe> ActiveRecipes);

    private async Task<PlanCatalogs> LoadPlanCatalogsAsync(IEnumerable<Guid> outputItemIds, CancellationToken ct)
    {
        var ids = outputItemIds.Distinct().ToList();
        var items = await (from i in db.Items
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where ids.Contains(i.Id)
                           select new { i.Id, Item = new PlanItem(i.Sku, i.Type, i.IsActive, u.Code) })
            .ToDictionaryAsync(x => x.Id, x => x.Item, ct);
        var recipes = await db.Recipes.Include(r => r.Lines).Where(r => ids.Contains(r.OutputItemId) && r.IsActive)
            .ToDictionaryAsync(r => r.OutputItemId, ct);
        return new PlanCatalogs(items, recipes);
    }

    private async Task<ProductionOrderPlan> BuildPlanAsync(Guid outputItemId, decimal plannedQty, DateOnly scheduledDate, Shift? shift,
        string? notes, CancellationToken ct) =>
        BuildPlan(await LoadPlanCatalogsAsync([outputItemId], ct), outputItemId, plannedQty, scheduledDate, shift, notes);

    /// <summary>Product active and produced (RN-14), RN-03b and active recipe (RN-10).</summary>
    private static ProductionOrderPlan BuildPlan(PlanCatalogs catalogs, Guid outputItemId, decimal plannedQty, DateOnly scheduledDate,
        Shift? shift, string? notes)
    {
        var item = catalogs.Items.GetValueOrDefault(outputItemId)
                   ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["outputItemId"] = ["El artículo no existe."] });
        if (!item.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {item.Sku} está inactivo.");
        if (!RecipeRules.CanBeProduced(item.Type))
            throw new BusinessRuleException("production_not_produced", $"{item.Sku} no se produce: solo semiterminados y productos terminados (RN-14).");
        if (item.Uom == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(plannedQty))
            throw new BusinessRuleException("whole_quantity_required", $"{item.Sku} se maneja en piezas: la cantidad debe ser entera.");

        var recipe = catalogs.ActiveRecipes.GetValueOrDefault(outputItemId)
                     ?? throw new BusinessRuleException("recipe_not_active", $"{item.Sku} no tiene receta activa: créala antes de programar la orden.");

        return new ProductionOrderPlan(recipe, plannedQty, scheduledDate, shift, notes);
    }

    private static decimal ProgressPct(ProductionOrder o) => decimal.Round(o.ProducedQty / o.PlannedQty * 100, 1);

    private async Task<decimal> ToleranceAsync(CancellationToken ct) => await db.GetSettingAsync(AppSettingKeys.OverrunTolerancePct, ct);

    private async Task<ProductionOrder> FindAsync(Guid id, CancellationToken ct)
    {
        var order = await db.ProductionOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("la orden de producción", id);
        scope.EnsureAccess(order.LocationId);
        return order;
    }

    private async Task<ProductionOrderDto> ToDtoAsync(ProductionOrder o, CancellationToken ct)
    {
        var output = await (from i in db.Items.AsNoTracking()
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where i.Id == o.OutputItemId
                            select new { i.Sku, i.Name, i.TracksLots, Uom = u.Code }).SingleAsync(ct);
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == o.LocationId).Select(l => l.Code).SingleAsync(ct);
        var recipe = await db.Recipes.AsNoTracking().Where(r => r.Id == o.RecipeId).Select(r => new { r.VersionNumber, r.FactoryId }).SingleAsync(ct);
        var recipeVersion = recipe.VersionNumber;
        var factory = recipe.FactoryId is { } factoryId
            ? await db.Locations.AsNoTracking().Where(l => l.Id == factoryId).Select(l => new { l.Code, l.Name }).SingleAsync(ct)
            : null;
        var importFolio = o.ImportId is { } importId
            ? await db.ProductionOrderImports.AsNoTracking().Where(i => i.Id == importId).Select(i => i.Folio).SingleOrDefaultAsync(ct)
            : null;

        var componentIds = o.Lines.Select(l => l.ComponentItemId).ToList();
        var components = await (from i in db.Items.AsNoTracking()
                                join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                                where componentIds.Contains(i.Id)
                                select new { i.Id, i.Sku, i.Name, i.Type, Uom = u.Code, HasRecipe = db.Recipes.Any(r => r.OutputItemId == i.Id && r.IsActive) })
            .ToDictionaryAsync(x => x.Id, ct);
        var available = o.IsOpen
            ? await RecipeService.UsableStockAsync(db, await RecipeService.StockLocationAsync(db, recipe.FactoryId, o.LocationId, ct),
                componentIds, clock.BusinessDate(), ct)
            : null;
        // RN-110: a draft with origins shows what is free there (what releasing would reserve).
        var sourced = o.Lines.Where(l => l.SourceLocationId is not null).Select(l => (l.SourceLocationId!.Value, l.ComponentItemId)).ToList();
        var free = o.Status == ProductionOrderStatus.Draft ? await FreeStockAsync(sourced, o.Id, ct) : [];
        var sourceIds = sourced.Select(s => s.Item1).Distinct().ToList();
        var sourceCodes = await db.Locations.AsNoTracking().Where(l => sourceIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);
        var vouchers = await (from t in db.Transfers.AsNoTracking()
                              where t.ProductionOrderId == o.Id
                              join f in db.Locations on t.FromLocationId equals f.Id
                              join d in db.Locations on t.ToLocationId equals d.Id
                              orderby t.Folio
                              select new ProductionOrderVoucherDto(t.Id, t.Folio, t.Status, f.Code, d.Code, t.Lines.Count)).ToListAsync(ct);

        var lines = o.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            decimal? avail = l.SourceLocationId is { } source && free.TryGetValue((source, l.ComponentItemId), out var atSource)
                ? atSource
                : available is null ? null : available.GetValueOrDefault(l.ComponentItemId);
            var pending = Math.Max(0, l.TheoreticalQty - l.ActualQty);
            return new ProductionOrderLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Type, c.Uom, c.HasRecipe, l.TheoreticalQty, l.ActualQty,
                avail, avail is null ? null : Math.Max(0, pending - avail.Value), l.SourceLocationId,
                l.SourceLocationId is { } s ? sourceCodes.GetValueOrDefault(s) : null);
        }).OrderBy(l => l.Sku).ToList();

        var users = await userDirectory.GetNamesAsync([o.CreatedBy, o.ReleasedBy, o.CompletedBy], ct);
        var tolerance = await ToleranceAsync(ct);
        var demands = await DemandsAsync(o.Id, ct);
        return new ProductionOrderDto(o.Id, o.Folio, o.LocationId, location, o.RecipeId, recipeVersion, o.OutputItemId, output.Sku, output.Name,
            output.Uom, output.TracksLots, o.PlannedQty, o.ProducedQty, o.PendingQty, ProgressPct(o), o.MaxAllowedQty(tolerance), o.ExceedsTolerance(tolerance),
            o.ScheduledDate,
            o.Shift, o.Source, o.ImportId, importFolio, o.Notes, o.Status, o.TotalCost, o.UnitCost, o.CloseCount,
            o.ReleasedAt, users.Of(o.ReleasedBy), o.CompletedAt, users.Of(o.CompletedBy), o.ShortfallReason, o.ShortfallNotes, o.CancelledAt,
            lines, demands, o.CreatedAt, users.Of(o.CreatedBy), o.Version, recipe.FactoryId, factory?.Code, factory?.Name, vouchers);
    }

    private async Task<List<ProductionOrderDemandDto>> DemandsAsync(Guid orderId, CancellationToken ct)
    {
        var links = await db.ProductionOrderDemands.AsNoTracking().Where(d => d.ProductionOrderId == orderId).ToListAsync(ct);
        if (links.Count == 0)
            return [];
        var lineIds = links.Select(l => l.DemandLineId).ToList();
        var branch = await (from o in db.BranchOrders.AsNoTracking()
                            from l in o.Lines
                            join b in db.Locations on o.RequestingLocationId equals b.Id
                            where lineIds.Contains(l.Id)
                            select new { l.Id, OrderId = o.Id, o.Folio, b.Name, o.RequiredDate }).ToDictionaryAsync(x => x.Id, ct);
        var customer = await (from o in db.CustomerOrders.AsNoTracking()
                              from l in o.Lines
                              join c in db.Customers on o.CustomerId equals c.Id
                              where lineIds.Contains(l.Id)
                              select new { l.Id, OrderId = o.Id, o.Folio, c.Name, o.RequiredDate }).ToDictionaryAsync(x => x.Id, ct);
        return links.Select(l =>
        {
            var doc = l.DemandType == DemandType.BranchOrderLine ? branch[l.DemandLineId] : customer[l.DemandLineId];
            return new ProductionOrderDemandDto(l.DemandType, l.DemandLineId, doc.OrderId, doc.Folio, doc.Name, doc.RequiredDate, l.Quantity);
        }).OrderBy(d => d.RequiredDate).ThenBy(d => d.Folio).ToList();
    }
}
