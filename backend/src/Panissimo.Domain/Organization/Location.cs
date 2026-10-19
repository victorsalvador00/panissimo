using Panissimo.Domain.Common;

namespace Panissimo.Domain.Organization;

public enum LocationType
{
    Plant,
    Branch,

    /// <summary>Sub-warehouse of a plant or branch (D-01, RN-44): it holds the stock of its parent.</summary>
    Warehouse,

    /// <summary>
    /// Production floor of a plant (RN-48): holds stock like a sub-warehouse; when the plant has one, production
    /// closes consume from and deliver to it, and stock reaches and leaves it with internal vouchers.
    /// </summary>
    Factory,
}

/// <summary>
/// The plant, a branch or a sub-warehouse of one of them (dominio §4.1). Code, type and parent do not change after creation.
/// </summary>
[Audited]
public class Location : AuditableEntity, IVersioned
{
    public const string PlantCode = "PLANTA";

    private Location() { }

    public Location(string code, string name, LocationType type, string? address = null)
    {
        if (type == LocationType.Warehouse)
            throw new BusinessRuleException("warehouse_parent_required", "Un subalmacén pertenece a una planta o sucursal: indica su ubicación padre.");
        if (type == LocationType.Factory)
            throw new BusinessRuleException("factory_parent_required", "Una fábrica pertenece a una planta: indica su ubicación padre.");
        Code = code.Trim().ToUpperInvariant();
        Type = type;
        Update(name, address);
        IsActive = true;
    }

    /// <summary>A sub-warehouse of <paramref name="parent"/> (RN-44): only plants and branches have sub-warehouses.</summary>
    public static Location Warehouse(string code, string name, Location parent, string? address = null) =>
        Child(code, name, parent, LocationType.Warehouse, address);

    /// <summary>The production floor of <paramref name="parent"/> (RN-48): only plants have one.</summary>
    public static Location Factory(string code, string name, Location parent, string? address = null)
    {
        if (parent.Type != LocationType.Plant)
            throw new BusinessRuleException("factory_parent_invalid", "Una fábrica pertenece a una planta: elige una planta.");
        return Child(code, name, parent, LocationType.Factory, address);
    }

    private static Location Child(string code, string name, Location parent, LocationType type, string? address)
    {
        if (parent.IsWarehouse)
            throw new BusinessRuleException("warehouse_parent_invalid", "Un subalmacén no puede tener subalmacenes: elige una planta o sucursal.");
        if (!parent.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {parent.Code} está inactiva.");
        var warehouse = new Location
        {
            Code = code.Trim().ToUpperInvariant(),
            Type = type,
            ParentLocationId = parent.Id,
            IsActive = true,
        };
        warehouse.Update(name, address);
        return warehouse;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public LocationType Type { get; private set; }

    /// <summary>Only for <see cref="LocationType.Warehouse"/> and <see cref="LocationType.Factory"/>: its plant or branch.</summary>
    public Guid? ParentLocationId { get; private set; }

    public string? Address { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    /// <summary>Holds the stock of its parent (RN-44): a sub-warehouse or a factory.</summary>
    public bool IsWarehouse => Type is LocationType.Warehouse or LocationType.Factory;

    public bool IsFactory => Type == LocationType.Factory;

    /// <summary>
    /// RN-48: when a plant has an active factory, a production close consumes from and delivers to a factory only.
    /// <paramref name="children"/> are the active sub-locations of the plant; <paramref name="chosen"/> the one resolved.
    /// </summary>
    public static void EnsureProductionFloor(IEnumerable<Location> children, Location chosen, bool consumption)
    {
        if (!chosen.IsFactory && children.Any(c => c.IsFactory && c.IsActive))
            throw new BusinessRuleException("close_requires_factory", consumption
                ? $"La planta tiene fábrica: el cierre consume solo de la fábrica, no de {chosen.Code}. Lleva la materia prima con un vale interno (RN-48)."
                : $"La planta tiene fábrica: el producto entra a la fábrica, no a {chosen.Code}. Después muévelo con un vale interno (RN-48).");
    }
    public bool CanPurchase => Type == LocationType.Plant;
    public bool CanProduce => Type == LocationType.Plant;
    public bool CanSupplyBranches => Type == LocationType.Plant;
    public bool CanSellToCustomers => Type == LocationType.Plant;

    public void Update(string name, string? address)
    {
        Name = name.Trim();
        Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}
