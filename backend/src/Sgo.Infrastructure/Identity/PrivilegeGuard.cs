using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

/// <summary>
/// Prevents privilege escalation from the security module: nobody can grant, remove or act upon
/// permissions or locations they do not hold themselves. Administrators pass every check.
/// </summary>
public sealed class PrivilegeGuard(SgoDbContext db, UserAccessContext accessContext, ILocationScope scope)
{
    public const string CannotGrantMessage = "No puedes otorgar ni quitar permisos que tú no tienes.";
    public const string CannotManageMessage = "No puedes administrar a un usuario con más permisos o ubicaciones que tú.";

    private IReadOnlySet<string> MyPermissions => accessContext.Access?.Permissions ?? new HashSet<string>();

    public void EnsureCanGrant(IEnumerable<string> permissions)
    {
        if (!permissions.All(MyPermissions.Contains))
            throw new ForbiddenException(CannotGrantMessage);
    }

    public async Task EnsureCanGrantRolesAsync(IEnumerable<Guid> roleIds, CancellationToken ct)
    {
        var ids = roleIds.ToList();
        var permissions = await db.RolePermissions.Where(rp => ids.Contains(rp.RoleId))
            .Select(rp => rp.PermissionCode).Distinct().ToListAsync(ct);
        EnsureCanGrant(permissions);
    }

    public void EnsureCanAssignLocations(IEnumerable<Guid> locationIds)
    {
        foreach (var id in locationIds)
            scope.EnsureAccess(id);
    }

    /// <summary>The target user's roles and locations must be within the caller's own.</summary>
    public async Task EnsureCanManageUserAsync(Guid userId, CancellationToken ct)
    {
        var roleIds = await db.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.RoleId).ToListAsync(ct);
        var locationIds = await db.UserLocations.Where(ul => ul.UserId == userId).Select(ul => ul.LocationId).ToListAsync(ct);
        var permissions = await db.RolePermissions.Where(rp => roleIds.Contains(rp.RoleId))
            .Select(rp => rp.PermissionCode).Distinct().ToListAsync(ct);

        if (!permissions.All(MyPermissions.Contains) || !locationIds.All(scope.AllowedLocationIds.Contains))
            throw new ForbiddenException(CannotManageMessage);
    }
}
