using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

public sealed record RecipeLineRequest(Guid ComponentItemId, decimal Quantity, decimal WastePct);

/// <param name="FactoryId">RN-49: factory where it is produced; required when the Planta has an active factory.</param>
public sealed record CreateRecipeRequest(Guid OutputItemId, decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineRequest> Lines,
    Guid? FactoryId = null);

/// <summary>
/// Edits the active version: in place, or as version N+1 if it was already used (RN-10). Changing only the factory
/// never creates a version, and the factory applies to every version of the item (RN-49).
/// </summary>
public sealed record UpdateRecipeRequest(uint Version, decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineRequest> Lines,
    Guid? FactoryId = null);

public sealed record RecipeListQuery : PageQuery
{
    public Guid? OutputItemId { get; init; }

    /// <summary>Also previous (inactive) versions.</summary>
    public bool IncludeInactive { get; init; }

    public ItemType? OutputType { get; init; }
}

public sealed record RecipeListItemDto(
    Guid Id, Guid OutputItemId, string OutputSku, string OutputName, ItemType OutputType, int RecipeVersion, bool IsActive, bool IsUsed,
    decimal YieldQty, string OutputUomCode, int LineCount, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName,
    DateTimeOffset? UpdatedAt, string? FactoryCode = null);

public sealed record RecipeLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, ItemType Type, string BaseUomCode, decimal Quantity, decimal WastePct, bool HasRecipe);

public sealed record RecipeVersionDto(Guid Id, int RecipeVersion, bool IsActive, bool IsUsed, DateTimeOffset CreatedAt);

public sealed record RecipeDto(
    Guid Id, Guid OutputItemId, string OutputSku, string OutputName, ItemType OutputType, string OutputUomCode, int RecipeVersion,
    bool IsActive, bool IsUsed, decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineDto> Lines, IReadOnlyList<RecipeVersionDto> Versions,
    DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, DateTimeOffset? UpdatedAt, string? UpdatedByName, uint Version,
    Guid? FactoryId = null, string? FactoryCode = null, string? FactoryName = null, ItemPresentation? OutputPresentation = null);

/// <param name="Available">Usable stock at the location (expired lots excluded, RN-05); null without location.</param>
/// <param name="HasRecipe">A semi-finished component with its own active recipe: a shortage is "por producir" (RN-67).</param>
public sealed record ExplosionLineDto(
    Guid ComponentItemId, string Sku, string Name, ItemType Type, string BaseUomCode, bool HasRecipe, decimal QuantityPerYield,
    decimal WastePct, decimal TheoreticalQty, decimal? Available, decimal? Shortage, decimal? AverageCost, decimal? EstimatedCost);

/// <param name="AverageCost">Current average cost at the location with its sub-warehouses (RN-04, RN-46).</param>
/// <param name="LineCost">Quantity × (1 + WastePct/100) × average cost, for the whole yield.</param>
/// <param name="Increase">Set when the component's cost rose recently (RN-51).</param>
public sealed record RecipeCostLineDto(
    Guid ComponentItemId, string Sku, string Name, string BaseUomCode, decimal Quantity, decimal WastePct, decimal AverageCost,
    decimal LineCost, CostIncreaseDto? Increase);

/// <param name="TotalCost">Cost of the whole yield.</param>
/// <param name="UnitCost">RN-51: theoretical cost per base unit of the product = total / yield.</param>
public sealed record RecipeVersionCostDto(
    Guid RecipeId, int RecipeVersion, bool IsActive, decimal YieldQty, decimal TotalCost, decimal UnitCost, int IncreaseCount,
    IReadOnlyList<RecipeCostLineDto> Lines);

/// <summary>RN-51: the theoretical cost of every version of a product's recipe at today's average costs. Read only.</summary>
public sealed record RecipeCostsDto(
    Guid OutputItemId, string OutputSku, string OutputName, string BaseUomCode, Guid LocationId, decimal AlertPct,
    IReadOnlyList<RecipeVersionCostDto> Versions);

public static class RecipeCostMath
{
    /// <summary>RN-51: Quantity × (1 + WastePct/100) × average cost.</summary>
    public static decimal LineCost(decimal quantity, decimal wastePct, decimal averageCost) =>
        InventoryMath.Round(quantity * (1 + wastePct / 100) * averageCost);

    /// <summary>RN-51: cost per unit of the product.</summary>
    public static decimal UnitCost(decimal totalCost, decimal yieldQty) =>
        yieldQty <= 0 ? 0 : InventoryMath.Round(totalCost / yieldQty);
}

public sealed record ExplosionDto(
    Guid RecipeId, Guid OutputItemId, string OutputSku, string OutputName, int RecipeVersion, decimal Quantity, decimal YieldQty,
    Guid? LocationId, IReadOnlyList<ExplosionLineDto> Lines, bool? CanProduce, decimal? EstimatedTotalCost, decimal? EstimatedUnitCost);

public sealed class RecipeLineRequestValidator : AbstractValidator<RecipeLineRequest>
{
    public RecipeLineRequestValidator()
    {
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(l => l.WastePct).InclusiveBetween(0, 100).WithName("Merma %")
            .Must(w => decimal.Round(w, 2) == w).WithMessage("La merma admite máximo 2 decimales.");
    }
}

public sealed class CreateRecipeRequestValidator : AbstractValidator<CreateRecipeRequest>
{
    public CreateRecipeRequestValidator()
    {
        RuleFor(x => x.YieldQty).GreaterThan(0).WithName("Rendimiento");
        RuleFor(x => x.Notes).MaximumLength(1000).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos un componente.");
        RuleForEach(x => x.Lines).SetValidator(new RecipeLineRequestValidator());
    }
}

public sealed class UpdateRecipeRequestValidator : AbstractValidator<UpdateRecipeRequest>
{
    public UpdateRecipeRequestValidator()
    {
        RuleFor(x => x.YieldQty).GreaterThan(0).WithName("Rendimiento");
        RuleFor(x => x.Notes).MaximumLength(1000).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos un componente.");
        RuleForEach(x => x.Lines).SetValidator(new RecipeLineRequestValidator());
    }
}

public interface IRecipeService
{
    Task<PagedResult<RecipeListItemDto>> ListAsync(RecipeListQuery query, CancellationToken ct = default);
    Task<RecipeDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<RecipeDto> CreateAsync(CreateRecipeRequest request, CancellationToken ct = default);

    /// <summary>RN-10: returns the resulting recipe; its id differs when a new version was created.</summary>
    Task<RecipeDto> UpdateAsync(Guid id, UpdateRecipeRequest request, CancellationToken ct = default);

    /// <summary>RN-10: activating a previous version requires deactivating the active one first.</summary>
    Task<RecipeDto> ActivateAsync(Guid id, uint version, CancellationToken ct = default);

    Task<RecipeDto> DeactivateAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-11/RN-12: theoretical consumption; with a location, usable availability, shortage and estimated cost.</summary>
    Task<ExplosionDto> ExplodeAsync(Guid id, decimal quantity, Guid? locationId, CancellationToken ct = default);

    /// <summary>RN-51: every version of the recipe's product, costed at the location's current average costs.</summary>
    Task<RecipeCostsDto> CostsAsync(Guid id, Guid locationId, CancellationToken ct = default);
}

public sealed class RecipeService(IAppDbContext db, ILocationScope scope, IClock clock, IUserDirectory userDirectory) : IRecipeService
{
    public async Task<PagedResult<RecipeListItemDto>> ListAsync(RecipeListQuery query, CancellationToken ct = default)
    {
        var rows = from r in db.Recipes.AsNoTracking()
                   join i in db.Items on r.OutputItemId equals i.Id
                   join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                   select new { Recipe = r, i.Sku, i.Name, i.Type, Uom = u.Code, LineCount = r.Lines.Count,
                       FactoryCode = db.Locations.Where(l => l.Id == r.FactoryId).Select(l => l.Code).FirstOrDefault() };
        if (!query.IncludeInactive)
            rows = rows.Where(x => x.Recipe.IsActive);
        if (query.OutputItemId is { } itemId)
            rows = rows.Where(x => x.Recipe.OutputItemId == itemId);
        if (query.OutputType is { } type)
            rows = rows.Where(x => x.Type == type);
        if (query.SearchTerm() is { } term)
            rows = rows.Where(x => x.Sku.ToLower().Contains(term) || x.Name.ToLower().Contains(term));

        var ordered = (query.Sort ?? "sku").Split(':')[0].ToLowerInvariant() switch
        {
            "name" => rows.OrderBy(x => x.Name).ThenByDescending(x => x.Recipe.VersionNumber),
            "sku" => rows.OrderBy(x => x.Sku).ThenByDescending(x => x.Recipe.VersionNumber),
            var other => throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["sort"] = [$"No se puede ordenar por '{other}'. Opciones: sku, name."],
            }),
        };

        var page = await ordered.ToPagedResultAsync(query, ct);
        var users = await userDirectory.GetNamesAsync(page.Items.Select(x => x.Recipe.CreatedBy), ct);
        return new PagedResult<RecipeListItemDto>(page.Items.Select(x => new RecipeListItemDto(x.Recipe.Id, x.Recipe.OutputItemId,
                x.Sku, x.Name, x.Type, x.Recipe.VersionNumber, x.Recipe.IsActive, x.Recipe.IsUsed, x.Recipe.YieldQty, x.Uom, x.LineCount,
                x.Recipe.CreatedAt, x.Recipe.CreatedBy, users.Of(x.Recipe.CreatedBy), x.Recipe.UpdatedAt, x.FactoryCode)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<RecipeDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<RecipeDto> CreateAsync(CreateRecipeRequest request, CancellationToken ct = default)
    {
        var output = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.OutputItemId, ct)
                     ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["outputItemId"] = ["El artículo no existe."] });
        if (!output.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {output.Sku} está inactivo.");
        if (!RecipeRules.CanBeProduced(output.Type))
            throw new BusinessRuleException("recipe_not_produced",
                $"{output.Sku} no se produce: solo los semiterminados y los productos terminados llevan receta.");
        if (await db.Recipes.AnyAsync(r => r.OutputItemId == output.Id && r.IsActive, ct))
            throw new BusinessRuleException("recipe_already_active", $"{output.Sku} ya tiene una receta activa (RN-10); edítala para crear una nueva versión.");

        var lines = ToInputs(request.Lines);
        await ValidateComponentsAsync(output.Id, lines, null, ct);
        await ValidateFactoryAsync(request.FactoryId, ct);

        var nextVersion = (await db.Recipes.Where(r => r.OutputItemId == output.Id).MaxAsync(r => (int?)r.VersionNumber, ct) ?? 0) + 1;
        var recipe = new Recipe(output.Id, nextVersion, request.YieldQty, request.Notes, lines);
        recipe.AssignFactory(request.FactoryId);
        db.Recipes.Add(recipe);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(recipe, ct);
    }

    public async Task<RecipeDto> UpdateAsync(Guid id, UpdateRecipeRequest request, CancellationToken ct = default)
    {
        var recipe = await FindAsync(id, ct);
        db.EnsureVersion(recipe, request.Version);
        var lines = ToInputs(request.Lines);
        await ValidateComponentsAsync(recipe.OutputItemId, lines, recipe.Id, ct);
        await ValidateFactoryAsync(request.FactoryId, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // RN-49: the factory is where, not what; an edit that only changes it stays in this version.
        var next = recipe.IsUsed && recipe.IsActive && recipe.HasFormula(request.YieldQty, request.Notes, lines)
            ? null
            : recipe.Revise(request.YieldQty, request.Notes, lines);
        if (recipe.FactoryId != request.FactoryId)
            foreach (var version in await db.Recipes.Where(r => r.OutputItemId == recipe.OutputItemId).ToListAsync(ct))
                version.AssignFactory(request.FactoryId);
        next?.AssignFactory(request.FactoryId);
        if (next is not null)
        {
            // RN-10 unique active index: the old version must be inactive before the new one is inserted.
            await db.SaveChangesAsync(ct);
            db.Recipes.Add(next);
        }
        else
        {
            db.Entry(recipe).State = EntityState.Modified;
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await ToDtoAsync(next ?? recipe, ct);
    }

    public async Task<RecipeDto> ActivateAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var recipe = await FindAsync(id, ct);
        db.EnsureVersion(recipe, version);
        if (await db.Recipes.AnyAsync(r => r.OutputItemId == recipe.OutputItemId && r.IsActive && r.Id != id, ct))
            throw new BusinessRuleException("recipe_already_active", "El artículo ya tiene otra versión activa; desactívala primero (RN-10).");
        var output = await db.Items.AsNoTracking().SingleAsync(i => i.Id == recipe.OutputItemId, ct);
        if (!output.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {output.Sku} está inactivo.");
        // The graph may have changed since this version was active.
        await ValidateComponentsAsync(recipe.OutputItemId,
            recipe.Lines.Select(l => new RecipeLineInput(l.ComponentItemId, l.Quantity, l.WastePct)).ToList(), recipe.Id, ct);

        recipe.Activate();
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(recipe, ct);
    }

    public async Task<RecipeDto> DeactivateAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var recipe = await FindAsync(id, ct);
        db.EnsureVersion(recipe, version);
        recipe.Deactivate();
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(recipe, ct);
    }

    public async Task<ExplosionDto> ExplodeAsync(Guid id, decimal quantity, Guid? locationId, CancellationToken ct = default)
    {
        var recipe = await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct)
                     ?? throw new NotFoundException("la receta", id);
        var consumption = recipe.Explode(quantity);
        var output = await db.Items.AsNoTracking().SingleAsync(i => i.Id == recipe.OutputItemId, ct);
        var components = await ComponentsAsync(recipe.Lines.Select(l => l.ComponentItemId), ct);

        Dictionary<Guid, decimal>? available = null;
        Dictionary<Guid, decimal>? costs = null;
        if (locationId is { } location)
        {
            scope.EnsureAccess(location);
            var itemIds = components.Keys.ToList();
            available = await UsableStockAsync(db, await StockLocationAsync(db, recipe.FactoryId, location, ct), itemIds, clock.BusinessDate(), ct);
            costs = await InventoryLocations.AverageCostsAsync(db, location, itemIds, ct);
        }

        var lines = recipe.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            var theoretical = consumption.Single(x => x.ComponentItemId == l.ComponentItemId).Quantity;
            decimal? avail = available is null ? null : available.GetValueOrDefault(l.ComponentItemId);
            decimal? cost = costs is null ? null : costs.GetValueOrDefault(l.ComponentItemId);
            return new ExplosionLineDto(l.ComponentItemId, c.Sku, c.Name, c.Type, c.Uom, c.HasRecipe, l.Quantity, l.WastePct, theoretical,
                avail, avail is null ? null : Math.Max(0, theoretical - avail.Value),
                cost, cost is null ? null : InventoryMath.Round(theoretical * cost.Value));
        }).OrderBy(l => l.Sku).ToList();

        decimal? total = locationId is null ? null : lines.Sum(l => l.EstimatedCost ?? 0);
        return new ExplosionDto(recipe.Id, output.Id, output.Sku, output.Name, recipe.VersionNumber, quantity, recipe.YieldQty,
            locationId, lines, locationId is null ? null : lines.All(l => l.Shortage == 0), total,
            total is null ? null : InventoryMath.Round(total.Value / quantity));
    }

    /// <summary>
    /// Usable stock per item at a location and its sub-warehouses (RN-46): expired lots cannot be used in production
    /// (RN-05, RN-12).
    /// </summary>
    /// <summary>RN-49: a recipe with a factory of <paramref name="plantId"/> uses the stock of that factory only.</summary>
    public static async Task<Guid> StockLocationAsync(IAppDbContext db, Guid? factoryId, Guid plantId, CancellationToken ct) =>
        factoryId is { } id && await db.Locations.AnyAsync(l => l.Id == id && l.ParentLocationId == plantId, ct) ? id : plantId;

    public static async Task<Dictionary<Guid, decimal>> UsableStockAsync(
        IAppDbContext db, Guid locationId, IReadOnlyCollection<Guid> itemIds, DateOnly today, CancellationToken ct)
    {
        var locationIds = await InventoryLocations.WithWarehousesAsync(db, locationId, ct);
        return await (from b in db.StockBalances.AsNoTracking()
               where locationIds.Contains(b.LocationId) && itemIds.Contains(b.ItemId) && b.Quantity > 0
               join l in db.Lots on b.LotId equals l.Id into lots
               from l in lots.DefaultIfEmpty()
               where l == null || l.ExpirationDate == null || l.ExpirationDate >= today
               group b by b.ItemId into g
               select new { g.Key, Qty = g.Sum(b => b.Quantity) }).ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
    }

    /// <summary>Components exist, are active and of an allowed type; the recipe must not create a cycle among active recipes.</summary>
    private async Task ValidateComponentsAsync(Guid outputItemId, IReadOnlyList<RecipeLineInput> lines, Guid? excludingRecipeId, CancellationToken ct)
    {
        var ids = lines.Select(l => l.ComponentItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var output = await db.Items.AsNoTracking().SingleAsync(i => i.Id == outputItemId, ct);
        var errors = new List<string>();
        if (items.Count != ids.Count)
            errors.Add("Uno o más componentes no existen.");
        errors.AddRange(items.Values.Where(i => !i.IsActive).Select(i => $"El componente {i.Sku} está inactivo."));
        errors.AddRange(items.Values.Where(i => !RecipeRules.CanBeComponent(i.Type, i.Presentation, output.Type, output.Presentation))
            .Select(i => i.Presentation == ItemPresentation.Bulk
                ? $"{i.Sku} es un producto terminado a granel: solo es componente de un producto empaquetado (RN-119)."
                : $"{i.Sku} es un producto terminado empaquetado: los componentes son materias primas, insumos, semiterminados o, en un empaquetado, terminados a granel."));
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors] });

        var graph = (await db.Recipes.AsNoTracking()
                .Where(r => r.IsActive && r.Id != excludingRecipeId && r.OutputItemId != outputItemId)
                .Select(r => new { r.OutputItemId, Components = r.Lines.Select(l => l.ComponentItemId).ToList() })
                .ToListAsync(ct))
            .ToDictionary(r => r.OutputItemId, r => (IReadOnlyList<Guid>)r.Components);
        if (RecipeGraph.CreatesCycle(outputItemId, ids, graph))
            throw new BusinessRuleException("recipe_cycle",
                "La receta crea un ciclo: un componente usa, directa o indirectamente, al producto que se está definiendo.");
    }

    private sealed record ComponentInfo(string Sku, string Name, ItemType Type, string Uom, bool HasRecipe);

    private async Task<Dictionary<Guid, ComponentInfo>> ComponentsAsync(IEnumerable<Guid> itemIds, CancellationToken ct)
    {
        var ids = itemIds.Distinct().ToList();
        return await (from i in db.Items.AsNoTracking()
                      join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                      where ids.Contains(i.Id)
                      select new
                      {
                          i.Id,
                          Info = new ComponentInfo(i.Sku, i.Name, i.Type, u.Code,
                              db.Recipes.Any(r => r.OutputItemId == i.Id && r.IsActive)),
                      }).ToDictionaryAsync(x => x.Id, x => x.Info, ct);
    }

    /// <summary>RN-49: an active factory; required while the Planta has one.</summary>
    private async Task ValidateFactoryAsync(Guid? factoryId, CancellationToken ct)
    {
        if (factoryId is { } id)
        {
            if (!await db.Locations.AnyAsync(l => l.Id == id && l.Type == LocationType.Factory && l.IsActive, ct))
                throw new RequestValidationException(new Dictionary<string, string[]> { ["factoryId"] = ["Elige una fábrica activa."] });
            return;
        }
        var plantHasFactory = await db.Locations.AnyAsync(l => l.Type == LocationType.Factory && l.IsActive
            && db.Locations.Any(p => p.Id == l.ParentLocationId && p.Code == Location.PlantCode), ct);
        if (plantHasFactory)
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["factoryId"] = ["La planta tiene fábrica: elige la fábrica donde se produce (RN-49)."] });
    }

    private async Task<Recipe> FindAsync(Guid id, CancellationToken ct) =>
        await db.Recipes.Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("la receta", id);

    private static List<RecipeLineInput> ToInputs(IEnumerable<RecipeLineRequest> lines) =>
        lines.Select(l => new RecipeLineInput(l.ComponentItemId, l.Quantity, l.WastePct)).ToList();

    private async Task<RecipeDto> ToDtoAsync(Recipe r, CancellationToken ct)
    {
        var output = await (from i in db.Items.AsNoTracking()
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where i.Id == r.OutputItemId
                            select new { i.Sku, i.Name, i.Type, i.Presentation, Uom = u.Code }).SingleAsync(ct);
        var components = await ComponentsAsync(r.Lines.Select(l => l.ComponentItemId), ct);
        var lines = r.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            return new RecipeLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Type, c.Uom, l.Quantity, l.WastePct, c.HasRecipe);
        }).OrderBy(l => l.Sku).ToList();
        var versions = await db.Recipes.AsNoTracking().Where(v => v.OutputItemId == r.OutputItemId)
            .OrderByDescending(v => v.VersionNumber)
            .Select(v => new RecipeVersionDto(v.Id, v.VersionNumber, v.IsActive, v.IsUsed, v.CreatedAt)).ToListAsync(ct);
        var users = await userDirectory.GetNamesAsync([r.CreatedBy, r.UpdatedBy], ct);
        var factory = r.FactoryId is { } factoryId
            ? await db.Locations.AsNoTracking().Where(l => l.Id == factoryId).Select(l => new { l.Code, l.Name }).SingleAsync(ct)
            : null;

        return new RecipeDto(r.Id, r.OutputItemId, output.Sku, output.Name, output.Type, output.Uom, r.VersionNumber, r.IsActive, r.IsUsed,
            r.YieldQty, r.Notes, lines, versions, r.CreatedAt, r.CreatedBy, users.Of(r.CreatedBy), r.UpdatedAt, users.Of(r.UpdatedBy), r.Version,
            r.FactoryId, factory?.Code, factory?.Name, output.Presentation);
    }

    public async Task<RecipeCostsDto> CostsAsync(Guid id, Guid locationId, CancellationToken ct = default)
    {
        scope.EnsureAccess(locationId);
        var outputId = await db.Recipes.AsNoTracking().Where(r => r.Id == id).Select(r => (Guid?)r.OutputItemId).SingleOrDefaultAsync(ct)
                       ?? throw new NotFoundException("la receta", id);
        var output = await (from i in db.Items.AsNoTracking()
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where i.Id == outputId
                            select new { i.Sku, i.Name, Uom = u.Code }).SingleAsync(ct);
        var versions = await db.Recipes.AsNoTracking().Include(r => r.Lines).Where(r => r.OutputItemId == outputId)
            .OrderByDescending(r => r.VersionNumber).ToListAsync(ct);

        var componentIds = versions.SelectMany(v => v.Lines).Select(l => l.ComponentItemId).Distinct().ToList();
        var components = await ComponentsAsync(componentIds, ct);
        var costs = await InventoryLocations.AverageCostsAsync(db, locationId, componentIds, ct);
        var alertPct = await db.GetSettingAsync(AppSettingKeys.CostIncreaseAlertPct, ct);
        var increases = await RecipeCostRules.IncreasesAsync(db, alertPct, clock.BusinessDate(), ct);

        var dtos = versions.Select(v =>
        {
            var lines = v.Lines.OrderBy(l => components[l.ComponentItemId].Sku).Select(l =>
            {
                var c = components[l.ComponentItemId];
                var average = costs.GetValueOrDefault(l.ComponentItemId);
                return new RecipeCostLineDto(l.ComponentItemId, c.Sku, c.Name, c.Uom, l.Quantity, l.WastePct, average,
                    RecipeCostMath.LineCost(l.Quantity, l.WastePct, average), increases.GetValueOrDefault(l.ComponentItemId));
            }).ToList();
            var total = lines.Sum(l => l.LineCost);
            return new RecipeVersionCostDto(v.Id, v.VersionNumber, v.IsActive, v.YieldQty, total, RecipeCostMath.UnitCost(total, v.YieldQty),
                lines.Count(l => l.Increase is not null), lines);
        }).ToList();
        return new RecipeCostsDto(outputId, output.Sku, output.Name, output.Uom, locationId, alertPct, dtos);
    }
}
