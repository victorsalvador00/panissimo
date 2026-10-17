using Panissimo.Domain.Common;

namespace Panissimo.Domain.Organization;

public enum LocationType
{
    Plant,
    Branch,
}

/// <summary>The plant or a branch (dominio §4.1). Code and type do not change after creation.</summary>
[Audited]
public class Location : AuditableEntity, IVersioned
{
    public const string PlantCode = "PLANTA";

    private Location() { }

    public Location(string code, string name, LocationType type, string? address = null)
    {
        Code = code.Trim().ToUpperInvariant();
        Type = type;
        Update(name, address);
        IsActive = true;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public LocationType Type { get; private set; }
    public string? Address { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

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
