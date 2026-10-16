using Sgo.Domain.Common;

namespace Sgo.Domain.Organization;

public enum LocationType
{
    Branch,
    Factory,
    Commissary,
}

[Audited]
public class Location : AuditableEntity, IVersioned
{
    private Location() { }

    public Location(string code, string name, LocationType type, string? address = null)
    {
        Code = code.Trim().ToUpperInvariant();
        Update(name, type, address);
        IsActive = true;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public LocationType Type { get; private set; }
    public string? Address { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public bool CanProduce => Type is LocationType.Factory or LocationType.Commissary;
    public bool CanSupplyBranches => Type is LocationType.Factory or LocationType.Commissary;

    /// <summary>Only the factory and the commissary buy from suppliers; branches order from the commissary.</summary>
    public bool CanPurchase => Type is LocationType.Factory or LocationType.Commissary;

    public void Update(string name, LocationType type, string? address)
    {
        Name = name.Trim();
        Type = type;
        Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}
