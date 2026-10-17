using Microsoft.AspNetCore.Identity;
using Panissimo.Domain.Common;
using Panissimo.Domain.Security;

namespace Panissimo.Infrastructure.Identity;

/// <summary>Paníssimo user (dominio §4.8) on top of ASP.NET Core Identity.</summary>
[Audited]
public class AppUser : IdentityUser<Guid>, IVersioned
{
    private AppUser() { }

    public AppUser(string email, string fullName)
    {
        Id = Guid.CreateVersion7();
        Email = email;
        UserName = email;
        FullName = fullName;
        IsActive = true;
    }

    public string FullName { get; set; } = null!;
    public bool IsActive { get; set; }
    public Guid? DefaultLocationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
    public uint Version { get; private set; }
}

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
    }

    public string Description { get; set; } = null!;

    /// <summary>Stable identifier of a seeded role (<see cref="SystemRoles"/>); survives renames.</summary>
    public string? SystemKey { get; private set; }

    /// <summary>Seeded role; editable but not deletable.</summary>
    public bool IsSystem => SystemKey is not null;

    public bool IsAdministrator => SystemKey == SystemRoles.AdministratorKey;

    public uint Version { get; private set; }
}
