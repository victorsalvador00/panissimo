using Panissimo.Domain.Common;

namespace Panissimo.Domain.Organization;

/// <summary>Production crew of the plant (dominio §4.1): Bizcocho Día, Pan de Sal Noche, Rondo…</summary>
[Audited]
public class ProductionArea : AuditableEntity, IVersioned
{
    private ProductionArea() { }

    public ProductionArea(string code, string name, int sortOrder)
    {
        Code = code.Trim().ToUpperInvariant();
        Update(name, sortOrder);
        IsActive = true;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public int SortOrder { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string name, int sortOrder)
    {
        Name = name.Trim();
        SortOrder = sortOrder;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}

/// <summary>Plant shift (dominio §4.1). An enum, not a catalog.</summary>
public enum Shift
{
    Day,
    Afternoon,
    Night,
}
