using Microsoft.AspNetCore.Identity;
using Sgo.Domain.Common;
using Sgo.Domain.Security;

namespace Sgo.Infrastructure.Identity;

/// <summary>A role is a set of permissions (RN-40). Permissions live in security.role_permission.</summary>
[Audited]
public class AppRole : IdentityRole<Guid>, IVersioned
{
    private AppRole() { }

    public AppRole(string name, string description, string? systemKey = null)
    {
        Id = Guid.CreateVersion7();
        Name = name;
        Description = description;
        SystemKey = systemKey;
        IsSystem = systemKey is not null;
    }

    public string Description { get; set; } = null!;

    /// <summary>Seeded role; editable but not deletable.</summary>
    public bool IsSystem { get; private set; }

    /// <summary>Stable identifier of a seeded role (<see cref="SystemRoles"/>); survives renames.</summary>
    public string? SystemKey { get; private set; }

    public bool IsAdministrator => SystemKey == SystemRoles.AdministratorKey;

    public uint Version { get; private set; }
}
