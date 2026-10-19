using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

/// <summary>RN-50b: the sub-warehouse a component of the order comes from.</summary>
public sealed record ComponentSourceRequest(Guid ComponentItemId, Guid SourceLocationId);

/// <summary>A sub-warehouse a component may come from, with its free stock (usable − reserved, RN-50a).</summary>
public sealed record ComponentSourceOptionDto(Guid ComponentItemId, Guid LocationId, string Code, string Name, decimal Free, bool IsDefault);

/// <summary>RN-50c: an ingredients voucher of the order.</summary>
public sealed record ProductionOrderVoucherDto(Guid Id, string Folio, TransferStatus Status, string FromLocationCode, string ToLocationCode, int LineCount);

/// <summary>
/// RN-50b: the active sub-warehouses (not factories) of each plant and the type of each component, to validate a chosen
/// origin and to default it by type (the sub-warehouse that "supplies" that type).
/// </summary>
internal sealed class ComponentSources
{
    private readonly ILookup<Guid, Location> _warehouses;
    private readonly IReadOnlyDictionary<Guid, ItemType> _types;

    private ComponentSources(ILookup<Guid, Location> warehouses, IReadOnlyDictionary<Guid, ItemType> types)
    {
        _warehouses = warehouses;
        _types = types;
    }

    public static async Task<ComponentSources> LoadAsync(IAppDbContext db, IEnumerable<Guid> plantIds, IEnumerable<Guid> componentIds,
        CancellationToken ct)
    {
        var plants = plantIds.Distinct().ToList();
        var components = componentIds.Distinct().ToList();
        var warehouses = await db.Locations.AsNoTracking()
            .Where(l => l.ParentLocationId != null && plants.Contains(l.ParentLocationId.Value) && l.Type == LocationType.Warehouse && l.IsActive)
            .OrderBy(l => l.Code).ToListAsync(ct);
        var types = await db.Items.AsNoTracking().Where(i => components.Contains(i.Id)).ToDictionaryAsync(i => i.Id, i => i.Type, ct);
        return new ComponentSources(warehouses.ToLookup(w => w.ParentLocationId!.Value), types);
    }

    public IEnumerable<Location> WarehousesOf(Guid plantId) => _warehouses[plantId];

    public bool IsWarehouseOf(Guid plantId, Guid locationId) => _warehouses[plantId].Any(w => w.Id == locationId);

    public Guid? DefaultFor(Guid plantId, Guid componentId) =>
        _types.TryGetValue(componentId, out var type)
            ? _warehouses[plantId].Where(w => w.Supplies(type)).Select(w => (Guid?)w.Id).FirstOrDefault()
            : null;

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
            if (!IsWarehouseOf(plantId, source.SourceLocationId))
                throw new RequestValidationException(new Dictionary<string, string[]>
                    { ["sources"] = ["El origen de un componente debe ser un subalmacén activo de la planta (no la fábrica)."] });
            picked[source.ComponentItemId] = source.SourceLocationId;
        }
        foreach (var component in components.Where(c => !picked.ContainsKey(c)))
            if (DefaultFor(plantId, component) is { } fallback)
                picked[component] = fallback;
        return picked;
    }
}
