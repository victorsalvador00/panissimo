using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

/// <summary>RN-50b: the sub-warehouse (or, for a produced component, the factory) a component of the order comes from.</summary>
public sealed record ComponentSourceRequest(Guid ComponentItemId, Guid SourceLocationId);

/// <summary>A sub-warehouse or factory a component may come from, with its free stock (usable − reserved, RN-50a).</summary>
public sealed record ComponentSourceOptionDto(Guid ComponentItemId, Guid LocationId, string Code, string Name, decimal Free, bool IsDefault);

/// <summary>RN-50c: an ingredients voucher of the order.</summary>
public sealed record ProductionOrderVoucherDto(Guid Id, string Folio, TransferStatus Status, string FromLocationCode, string ToLocationCode, int LineCount);

/// <summary>
/// RN-111: where each component of a plant's orders may come from and its default. Raw materials and supplies come from
/// an active sub-warehouse; semi-finished and finished goods also from an active factory (where they are produced). The
/// default of a produced component is the factory of its active recipe, else the sub-warehouse that "supplies" its type.
/// </summary>
internal sealed class ComponentSources
{
    private readonly ILookup<Guid, Location> _warehouses;
    private readonly ILookup<Guid, Location> _factories;
    private readonly IReadOnlyDictionary<Guid, ItemType> _types;
    private readonly IReadOnlyDictionary<Guid, Guid> _recipeFactories;

    private ComponentSources(ILookup<Guid, Location> warehouses, ILookup<Guid, Location> factories, IReadOnlyDictionary<Guid, ItemType> types,
        IReadOnlyDictionary<Guid, Guid> recipeFactories)
    {
        _warehouses = warehouses;
        _factories = factories;
        _types = types;
        _recipeFactories = recipeFactories;
    }

    public static async Task<ComponentSources> LoadAsync(IAppDbContext db, IEnumerable<Guid> plantIds, IEnumerable<Guid> componentIds,
        CancellationToken ct)
    {
        var plants = plantIds.Distinct().ToList();
        var components = componentIds.Distinct().ToList();
        var floors = await db.Locations.AsNoTracking()
            .Where(l => l.ParentLocationId != null && plants.Contains(l.ParentLocationId.Value) && l.IsActive
                        && (l.Type == LocationType.Warehouse || l.Type == LocationType.Factory))
            .OrderBy(l => l.Code).ToListAsync(ct);
        var types = await db.Items.AsNoTracking().Where(i => components.Contains(i.Id)).ToDictionaryAsync(i => i.Id, i => i.Type, ct);
        var recipeFactories = await db.Recipes.AsNoTracking()
            .Where(r => r.IsActive && r.FactoryId != null && components.Contains(r.OutputItemId))
            .ToDictionaryAsync(r => r.OutputItemId, r => r.FactoryId!.Value, ct);
        return new ComponentSources(floors.Where(l => l.Type == LocationType.Warehouse).ToLookup(w => w.ParentLocationId!.Value),
            floors.Where(l => l.Type == LocationType.Factory).ToLookup(f => f.ParentLocationId!.Value), types, recipeFactories);
    }

    /// <summary>RN-111: semi-finished and finished goods may also come from a factory.</summary>
    public static bool MayComeFromFactory(ItemType type) => RecipeRules.CanBeProduced(type);

    /// <summary>The origins a component may take at a plant: its sub-warehouses and, if produced, its factories.</summary>
    public IEnumerable<Location> OptionsFor(Guid plantId, Guid componentId) =>
        _types.TryGetValue(componentId, out var type) && MayComeFromFactory(type)
            ? _warehouses[plantId].Concat(_factories[plantId])
            : _warehouses[plantId];

    public bool IsSourceOf(Guid plantId, Guid componentId, Guid locationId) => OptionsFor(plantId, componentId).Any(l => l.Id == locationId);

    public Guid? DefaultFor(Guid plantId, Guid componentId)
    {
        if (!_types.TryGetValue(componentId, out var type))
            return null;
        if (MayComeFromFactory(type) && _recipeFactories.TryGetValue(componentId, out var factoryId)
                                     && _factories[plantId].Any(f => f.Id == factoryId))
            return factoryId;
        return _warehouses[plantId].Where(w => w.Supplies(type)).Select(w => (Guid?)w.Id).FirstOrDefault();
    }

    /// <summary>Chosen origin per component (validated), else its default; a component without either has none yet.</summary>
    public IReadOnlyDictionary<Guid, Guid> Resolve(Guid plantId, Recipe recipe, IReadOnlyList<ComponentSourceRequest>? chosen)
    {
        var components = recipe.Lines.Select(l => l.ComponentItemId).ToHashSet();
        var picked = new Dictionary<Guid, Guid>();
        foreach (var source in chosen ?? [])
        {
            if (!components.Contains(source.ComponentItemId))
                throw new RequestValidationException(new Dictionary<string, string[]>
                    { ["sources"] = ["Hay un origen para un artículo que no es componente de la receta."] });
            if (!IsSourceOf(plantId, source.ComponentItemId, source.SourceLocationId))
                throw new RequestValidationException(new Dictionary<string, string[]>
                {
                    ["sources"] = ["El origen de un componente debe ser un subalmacén activo de la planta; un semiterminado o terminado también puede venir de una fábrica activa (RN-111)."],
                });
            picked[source.ComponentItemId] = source.SourceLocationId;
        }
        foreach (var component in components.Where(c => !picked.ContainsKey(c)))
            if (DefaultFor(plantId, component) is { } fallback)
                picked[component] = fallback;
        return picked;
    }
}
