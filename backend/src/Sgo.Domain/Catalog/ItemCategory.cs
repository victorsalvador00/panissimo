using Sgo.Domain.Common;

namespace Sgo.Domain.Catalog;

[Audited]
public class ItemCategory : AuditableEntity, IVersioned
{
    private ItemCategory() { }

    public ItemCategory(string name)
    {
        Rename(name);
        IsActive = true;
    }

    public string Name { get; private set; } = null!;
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Rename(string name) => Name = name.Trim();
    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}
