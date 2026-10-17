using Panissimo.Domain.Common;

namespace Panissimo.Domain.Organization;

public enum LocationType
{
    Plant,
    Branch,

    /// <summary>Sub-warehouse of a plant or branch (D-01, RN-44): it holds the stock of its parent.</summary>
    Warehouse,
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
        Code = code.Trim().ToUpperInvariant();
        Type = type;
        Update(name, address);
        IsActive = true;
    }

    /// <summary>A sub-warehouse of <paramref name="parent"/> (RN-44): only plants and branches have sub-warehouses.</summary>
    public static Location Warehouse(string code, string name, Location parent, string? address = null)
    {
        if (parent.Type == LocationType.Warehouse)
            throw new BusinessRuleException("warehouse_parent_invalid", "Un subalmacén no puede tener subalmacenes: elige una planta o sucursal.");
        if (!parent.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {parent.Code} está inactiva.");
        var warehouse = new Location
        {
            Code = code.Trim().ToUpperInvariant(),
            Type = LocationType.Warehouse,
            ParentLocationId = parent.Id,
            IsActive = true,
        };
        warehouse.Update(name, address);
        return warehouse;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public LocationType Type { get; private set; }

    /// <summary>Only for <see cref="LocationType.Warehouse"/>: its plant or branch.</summary>
    public Guid? ParentLocationId { get; private set; }

    public string? Address { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public bool IsWarehouse => Type == LocationType.Warehouse;
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
