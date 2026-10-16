using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Production;

namespace Sgo.Application.Production;

public sealed record RecipeLineRequest(Guid ComponentItemId, decimal Quantity, decimal WastePct);

public sealed record CreateRecipeRequest(Guid OutputItemId, decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineRequest> Lines);

/// <summary>
/// On the active version: edits content (in place, or as version N+1 if already used) or deactivates it.
/// On an inactive version: only reactivation, with its content unchanged.
/// </summary>
public sealed record UpdateRecipeRequest(uint Version, decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineRequest> Lines, bool IsActive);

public sealed record RecipeListQuery : PageQuery
{
    public Guid? OutputItemId { get; init; }
    public bool IncludeInactive { get; init; }
}

public sealed record RecipeListItemDto(
    Guid Id, Guid OutputItemId, string OutputSku, string OutputName, int RecipeVersion, bool IsActive, bool IsUsed,
    decimal YieldQty, string OutputUomCode, int LineCount, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName,
    DateTimeOffset? UpdatedAt);

public sealed record RecipeLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, ItemType Type, string BaseUomCode, decimal Quantity, decimal WastePct, bool HasRecipe);

public sealed record RecipeDto(
    Guid Id, Guid OutputItemId, string OutputSku, string OutputName, string OutputUomCode, int RecipeVersion, bool IsActive, bool IsUsed,
    decimal YieldQty, string? Notes, IReadOnlyList<RecipeLineDto> Lines, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName,
    DateTimeOffset? UpdatedAt, uint Version);

/// <param name="Available">Usable stock at the location (expired lots excluded, RN-05); null without location.</param>
public sealed record ExplosionLineDto(
    Guid ComponentItemId, string Sku, string Name, string BaseUomCode, bool HasRecipe, decimal QuantityPerYield, decimal WastePct,
    decimal TheoreticalQty, decimal? Available, decimal? Shortage, decimal? AverageCost, decimal? EstimatedCost);

public sealed record ExplosionDto(
    Guid RecipeId, Guid OutputItemId, string OutputSku, string OutputName, int RecipeVersion, decimal Quantity, decimal YieldQty,
    Guid? LocationId, IReadOnlyList<ExplosionLineDto> Lines, bool? CanProduce, decimal? EstimatedTotalCost, decimal? EstimatedUnitCost);

public sealed class RecipeLineRequestValidator : AbstractValidator<RecipeLineRequest>
{
    public RecipeLineRequestValidator()
    {
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(l => l.WastePct).InclusiveBetween(0, 100).WithName("Merma %");
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

    /// <summary>RN-11 theoretical consumption; with a location, availability and estimated cost.</summary>
    Task<ExplosionDto> ExplodeAsync(Guid id, decimal quantity, Guid? locationId, CancellationToken ct = default);
}

public sealed class RecipeService(ISgoDbContext db, ILocationScope scope, IClock clock, IUserDirectory userDirectory) : IRecipeService
{
    public async Task<PagedResult<RecipeListItemDto>> ListAsync(RecipeListQuery query, CancellationToken ct = default)
    {
        var rows = from r in db.Recipes.AsNoTracking()
                   join i in db.Items on r.OutputItemId equals i.Id
                   join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                   select new { Recipe = r, i.Sku, i.Name, Uom = u.Code, LineCount = r.Lines.Count };
        if (!query.IncludeInactive)
            rows = rows.Where(x => x.Recipe.IsActive);
        if (query.OutputItemId is { } itemId)
            rows = rows.Where(x => x.Recipe.OutputItemId == itemId);
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
                x.Sku, x.Name, x.Recipe.VersionNumber, x.Recipe.IsActive, x.Recipe.IsUsed, x.Recipe.YieldQty, x.Uom, x.LineCount,
                x.Recipe.CreatedAt, x.Recipe.CreatedBy, users.Of(x.Recipe.CreatedBy), x.Recipe.UpdatedAt)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<RecipeDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<RecipeDto> CreateAsync(CreateRecipeRequest request, CancellationToken ct = default)
    {
        var output = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.OutputItemId, ct)
                     ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["outputItemId"] = ["El artículo no existe."] });
        if (!output.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {output.Sku} está inactivo.");
        if (output.Type == ItemType.RawMaterial)
            throw new BusinessRuleException("recipe_raw_material", $"{output.Sku} es materia prima: solo intermedios y terminados llevan receta.");
        if (await db.Recipes.AnyAsync(r => r.OutputItemId == output.Id && r.IsActive, ct))
            throw new BusinessRuleException("recipe_already_active", $"{output.Sku} ya tiene una receta activa (RN-10); edítala para crear una nueva versión.");

        var lines = ToInputs(request.Lines);
        await ValidateComponentsAsync(output.Id, lines, null, ct);

        var nextVersion = (await db.Recipes.Where(r => r.OutputItemId == output.Id).MaxAsync(r => (int?)r.VersionNumber, ct) ?? 0) + 1;
        var recipe = new Recipe(output.Id, nextVersion, request.YieldQty, request.Notes, lines);
        db.Recipes.Add(recipe);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(recipe, ct);
    }

    public async Task<RecipeDto> UpdateAsync(Guid id, UpdateRecipeRequest request, CancellationToken ct = default)
    {
        var recipe = await FindAsync(id, ct);
        db.EnsureVersion(recipe, request.Version);
        var lines = ToInputs(request.Lines);

        if (!recipe.IsActive)
        {
            if (!request.IsActive || !recipe.HasSameContent(request.YieldQty, lines))
                throw new BusinessRuleException("recipe_not_active", "Solo la versión activa puede editarse. Para usar esta versión, actívala sin cambios.");
            if (await db.Recipes.AnyAsync(r => r.OutputItemId == recipe.OutputItemId && r.IsActive, ct))
                throw new BusinessRuleException("recipe_already_active", "El artículo ya tiene otra versión activa; desactívala primero (RN-10).");
            await ValidateComponentsAsync(recipe.OutputItemId, lines, recipe.Id, ct); // the graph may have changed since
            recipe.Activate();
            await db.SaveChangesAsync(ct);
            return await ToDtoAsync(recipe, ct);
        }

        if (!request.IsActive)
        {
            if (!recipe.HasSameContent(request.YieldQty, lines))
                throw new BusinessRuleException("recipe_edit_and_deactivate", "Guarda los cambios y luego desactiva la receta, o desactívala sin cambios.");
            recipe.Deactivate();
            await db.SaveChangesAsync(ct);
            return await ToDtoAsync(recipe, ct);
        }

        await ValidateComponentsAsync(recipe.OutputItemId, lines, recipe.Id, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var next = recipe.Revise(request.YieldQty, request.Notes, lines);
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
            var today = clock.BusinessDate();
            // Usable stock: expired lots cannot be used in production (RN-05).
            available = await (from b in db.StockBalances.AsNoTracking()
                               where b.LocationId == location && itemIds.Contains(b.ItemId) && b.Quantity > 0
                               join l in db.Lots on b.LotId equals l.Id into lots
                               from l in lots.DefaultIfEmpty()
                               where l == null || l.ExpirationDate == null || l.ExpirationDate >= today
                               group b by b.ItemId into g
                               select new { g.Key, Qty = g.Sum(b => b.Quantity) }).ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
            costs = await db.ItemLocationCosts.AsNoTracking().Where(c => c.LocationId == location && itemIds.Contains(c.ItemId))
                .ToDictionaryAsync(c => c.ItemId, c => c.AverageCost, ct);
        }

        var lines = recipe.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            var theoretical = consumption.Single(x => x.ComponentItemId == l.ComponentItemId).Quantity;
            decimal? avail = available is null ? null : available.GetValueOrDefault(l.ComponentItemId);
            decimal? cost = costs is null ? null : costs.GetValueOrDefault(l.ComponentItemId);
            return new ExplosionLineDto(l.ComponentItemId, c.Sku, c.Name, c.Uom, c.HasRecipe, l.Quantity, l.WastePct, theoretical,
                avail, avail is null ? null : Math.Max(0, theoretical - avail.Value),
                cost, cost is null ? null : InventoryMath.Round(theoretical * cost.Value));
        }).OrderBy(l => l.Sku).ToList();

        decimal? total = locationId is null ? null : lines.Sum(l => l.EstimatedCost ?? 0);
        return new ExplosionDto(recipe.Id, output.Id, output.Sku, output.Name, recipe.VersionNumber, quantity, recipe.YieldQty,
            locationId, lines, locationId is null ? null : lines.All(l => l.Shortage == 0), total,
            total is null ? null : InventoryMath.Round(total.Value / quantity));
    }

    /// <summary>Components exist and are active; the recipe must not create a cycle among active recipes.</summary>
    private async Task ValidateComponentsAsync(Guid outputItemId, IReadOnlyList<RecipeLineInput> lines, Guid? excludingRecipeId, CancellationToken ct)
    {
        var ids = lines.Select(l => l.ComponentItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => ids.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var errors = new List<string>();
        if (items.Count != ids.Count)
            errors.Add("Uno o más componentes no existen.");
        errors.AddRange(items.Values.Where(i => !i.IsActive).Select(i => $"El componente {i.Sku} está inactivo."));
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

    private async Task<Recipe> FindAsync(Guid id, CancellationToken ct) =>
        await db.Recipes.Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("la receta", id);

    private static List<RecipeLineInput> ToInputs(IEnumerable<RecipeLineRequest> lines) =>
        lines.Select(l => new RecipeLineInput(l.ComponentItemId, l.Quantity, l.WastePct)).ToList();

    private async Task<RecipeDto> ToDtoAsync(Recipe r, CancellationToken ct)
    {
        var output = await (from i in db.Items.AsNoTracking()
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where i.Id == r.OutputItemId
                            select new { i.Sku, i.Name, Uom = u.Code }).SingleAsync(ct);
        var components = await ComponentsAsync(r.Lines.Select(l => l.ComponentItemId), ct);
        var lines = r.Lines.Select(l =>
        {
            var c = components[l.ComponentItemId];
            return new RecipeLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Type, c.Uom, l.Quantity, l.WastePct, c.HasRecipe);
        }).OrderBy(l => l.Sku).ToList();
        var users = await userDirectory.GetNamesAsync([r.CreatedBy], ct);

        return new RecipeDto(r.Id, r.OutputItemId, output.Sku, output.Name, output.Uom, r.VersionNumber, r.IsActive, r.IsUsed,
            r.YieldQty, r.Notes, lines, r.CreatedAt, r.CreatedBy, users.Of(r.CreatedBy), r.UpdatedAt, r.Version);
    }
}
