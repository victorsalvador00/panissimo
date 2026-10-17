using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

/// <param name="ProductionAreaId">Null = the item's default area.</param>
public sealed record CreateProductionOrderRequest(
    Guid LocationId, Guid OutputItemId, decimal PlannedQty, DateOnly ScheduledDate, Guid? ProductionAreaId, Shift? Shift, string? Notes);

/// <summary>Draft only (RN-60). Changing the product takes its active recipe.</summary>
public sealed record UpdateProductionOrderRequest(
    uint Version, Guid OutputItemId, decimal PlannedQty, DateOnly ScheduledDate, Guid? ProductionAreaId, Shift? Shift, string? Notes);

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
    public Guid? AreaId { get; init; }
    public Shift? Shift { get; init; }
    public ProductionOrderSource? Source { get; init; }
    public Guid? ImportId { get; init; }
    public Guid? OutputItemId { get; init; }
}

public sealed record ProductionOrderListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid OutputItemId, string Sku, string ItemName, string BaseUomCode,
    int RecipeVersion, decimal PlannedQty, decimal ProducedQty, decimal ProgressPct, int CloseCount, DateOnly ScheduledDate,
    Guid? ProductionAreaId, string? ProductionAreaName, Shift? Shift, ProductionOrderSource Source, Guid? ImportId,
    ProductionOrderStatus Status, DateTimeOffset CreatedAt);

/// <param name="Available">Usable stock at the plant while the order is open (RN-12); null once finished.</param>
public sealed record ProductionOrderLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, ItemType Type, string BaseUomCode, bool HasRecipe,
    decimal TheoreticalQty, decimal ActualQty, decimal? Available, decimal? Shortage);

public sealed record ProductionOrderDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid RecipeId, int RecipeVersion, Guid OutputItemId, string Sku,
    string ItemName, string BaseUomCode, bool TracksLots, decimal PlannedQty, decimal ProducedQty, decimal PendingQty, decimal ProgressPct,
    decimal MaxAllowedQty, DateOnly ScheduledDate, Guid? ProductionAreaId, string? ProductionAreaName, Shift? Shift,
    ProductionOrderSource Source, Guid? ImportId, string? ImportFolio, string? Notes, ProductionOrderStatus Status,
    decimal TotalCost, decimal UnitCost, int CloseCount,
    DateTimeOffset? ReleasedAt, string? ReleasedByName, DateTimeOffset? CompletedAt, string? CompletedByName,
    ShortfallReason? ShortfallReason, string? ShortfallNotes, DateTimeOffset? CancelledAt,
    IReadOnlyList<ProductionOrderLineDto> Lines, DateTimeOffset CreatedAt, string? CreatedByName, uint Version);

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
    /// Validates the plant, scope, product, active recipe, area and RN-03b; marks the recipe as used (RN-10).
    /// </summary>
    Task<ProductionOrder> CreateInTransactionAsync(CreateProductionOrderRequest request, ProductionOrderSource source, Guid? importId,
        CancellationToken ct = default);

    Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default);
    Task<ProductionOrderDto> ReleaseAsync(Guid id, uint version, CancellationToken ct = default);
    Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);
}

public sealed class ProductionOrderService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IProductionOrderService
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
        if (query.AreaId is { } areaId)
            orders = orders.Where(o => o.ProductionAreaId == areaId);
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
        var versions = await db.Recipes.AsNoTracking().Where(r => recipeIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.VersionNumber, ct);
        var areaIds = page.Items.Select(o => o.ProductionAreaId).OfType<Guid>().Distinct().ToList();
        var areas = await db.ProductionAreas.AsNoTracking().Where(a => areaIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Name, ct);
        var locationIds = page.Items.Select(o => o.LocationId).Distinct().ToList();
        var codes = await db.Locations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return new PagedResult<ProductionOrderListItemDto>(page.Items.Select(o => new ProductionOrderListItemDto(o.Id, o.Folio, o.LocationId,
                codes[o.LocationId], o.OutputItemId, items[o.OutputItemId].Sku, items[o.OutputItemId].Name, items[o.OutputItemId].Uom,
                versions[o.RecipeId], o.PlannedQty, o.ProducedQty, ProgressPct(o), o.CloseCount, o.ScheduledDate, o.ProductionAreaId,
                o.ProductionAreaId is { } a ? areas.GetValueOrDefault(a) : null, o.Shift, o.Source, o.ImportId, o.Status, o.CreatedAt)).ToList(),
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
        Guid? importId, CancellationToken ct = default)
    {
        await EnsurePlantAsync(request.LocationId, ct);
        var plan = await BuildPlanAsync(request.OutputItemId, request.PlannedQty, request.ScheduledDate, request.ProductionAreaId,
            request.Shift, request.Notes, ct);

        var order = new ProductionOrder(await folios.NextAsync(DocType.ProductionOrder, ct), request.LocationId, plan, source, importId,
            clock.BusinessDate());
        plan.Recipe.MarkUsed();
        db.ProductionOrders.Add(order);
        return order;
    }

    public async Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        var plan = await BuildPlanAsync(request.OutputItemId, request.PlannedQty, request.ScheduledDate, request.ProductionAreaId,
            request.Shift, request.Notes, ct);

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
        order.Release(clock.UtcNow, currentUser.UserId);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        order.Cancel(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
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

    private async Task<ProductionOrderPlan> BuildPlanAsync(Guid outputItemId, decimal plannedQty, DateOnly scheduledDate, Guid? areaId,
        Shift? shift, string? notes, CancellationToken ct)
    {
        var item = await (from i in db.Items
                          join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                          where i.Id == outputItemId
                          select new { i.Sku, i.Type, i.IsActive, i.ProductionAreaId, Uom = u.Code }).SingleOrDefaultAsync(ct)
                   ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["outputItemId"] = ["El artículo no existe."] });
        if (!item.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {item.Sku} está inactivo.");
        if (!RecipeRules.CanBeProduced(item.Type))
            throw new BusinessRuleException("production_not_produced", $"{item.Sku} no se produce: solo semiterminados y productos terminados (RN-14).");
        if (item.Uom == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(plannedQty))
            throw new BusinessRuleException("whole_quantity_required", $"{item.Sku} se maneja en piezas: la cantidad debe ser entera.");

        var recipe = await db.Recipes.Include(r => r.Lines).SingleOrDefaultAsync(r => r.OutputItemId == outputItemId && r.IsActive, ct)
                     ?? throw new BusinessRuleException("recipe_not_active", $"{item.Sku} no tiene receta activa: créala antes de programar la orden.");

        var area = areaId ?? item.ProductionAreaId;
        if (area is { } id && !await db.ProductionAreas.AnyAsync(a => a.Id == id && a.IsActive, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["productionAreaId"] = ["El área de producción no existe o está inactiva."] });

        return new ProductionOrderPlan(recipe, plannedQty, scheduledDate, area, shift, notes);
    }

    private static decimal ProgressPct(ProductionOrder o) => decimal.Round(o.ProducedQty / o.PlannedQty * 100, 1);

    /// <summary>RN-63: total produced may not exceed PlannedQty × (1 + tolerance).</summary>
    private async Task<decimal> MaxAllowedAsync(ProductionOrder o, CancellationToken ct) =>
        InventoryMath.Round(o.PlannedQty * (1 + await db.GetSettingAsync(AppSettingKeys.OverrunTolerancePct, ct) / 100m));

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
        var recipeVersion = await db.Recipes.AsNoTracking().Where(r => r.Id == o.RecipeId).Select(r => r.VersionNumber).SingleAsync(ct);
        var areaName = o.ProductionAreaId is { } areaId
            ? await db.ProductionAreas.AsNoTracking().Where(a => a.Id == areaId).Select(a => a.Name).SingleOrDefaultAsync(ct)
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
            ? await RecipeService.UsableStockAsync(db, o.LocationId, componentIds, clock.BusinessDate(), ct)
            : null;

        var lines = o.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            decimal? avail = available is null ? null : available.GetValueOrDefault(l.ComponentItemId);
            var pending = Math.Max(0, l.TheoreticalQty - l.ActualQty);
            return new ProductionOrderLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Type, c.Uom, c.HasRecipe, l.TheoreticalQty, l.ActualQty,
                avail, avail is null ? null : Math.Max(0, pending - avail.Value));
        }).OrderBy(l => l.Sku).ToList();

        var users = await userDirectory.GetNamesAsync([o.CreatedBy, o.ReleasedBy, o.CompletedBy], ct);
        return new ProductionOrderDto(o.Id, o.Folio, o.LocationId, location, o.RecipeId, recipeVersion, o.OutputItemId, output.Sku, output.Name,
            output.Uom, output.TracksLots, o.PlannedQty, o.ProducedQty, o.PendingQty, ProgressPct(o), await MaxAllowedAsync(o, ct), o.ScheduledDate,
            o.ProductionAreaId, areaName, o.Shift, o.Source, o.ImportId, importFolio, o.Notes, o.Status, o.TotalCost, o.UnitCost, o.CloseCount,
            o.ReleasedAt, users.Of(o.ReleasedBy), o.CompletedAt, users.Of(o.CompletedBy), o.ShortfallReason, o.ShortfallNotes, o.CancelledAt,
            lines, o.CreatedAt, users.Of(o.CreatedBy), o.Version);
    }
}
