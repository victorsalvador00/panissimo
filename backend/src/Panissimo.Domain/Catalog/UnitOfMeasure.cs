using Panissimo.Domain.Common;

namespace Panissimo.Domain.Catalog;

public enum UomKind
{
    Mass,
    Volume,
    Unit,
}

[Audited]
public class UnitOfMeasure : AuditableEntity, IVersioned
{
    /// <summary>RN-03b: quantities in this unit must be whole numbers.</summary>
    public const string PieceCode = "pza";

    private UnitOfMeasure() { }

    public UnitOfMeasure(string code, string name, UomKind kind)
    {
        Code = code.Trim().ToLowerInvariant();
        Update(name, kind);
        IsActive = true;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public UomKind Kind { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public bool RequiresWholeQuantities => Code == PieceCode;

    public void Update(string name, UomKind kind)
    {
        Name = name.Trim();
        Kind = kind;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}
