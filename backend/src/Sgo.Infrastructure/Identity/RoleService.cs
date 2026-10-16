using System.Linq.Expressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

public sealed class RoleService(
    SgoDbContext db,
    RoleManager<AppRole> roleManager,
    PrivilegeGuard guard,
    IUserAccessService userAccess,
    ICurrentUser currentUser) : IRoleService
{
    public Task<PagedResult<RoleListItemDto>> ListAsync(PageQuery query, CancellationToken ct = default)
    {
        var roles = db.Roles.AsNoTracking();
        if (query.SearchTerm() is { } term)
            roles = roles.Where(r => r.Name!.ToLower().Contains(term) || r.Description.ToLower().Contains(term));

        var sortColumns = new Dictionary<string, Expression<Func<AppRole, object?>>>
        {
            ["name"] = r => r.Name,
            ["userCount"] = r => db.UserRoles.Count(ur => ur.RoleId == r.Id),
        };

        return roles
            .ApplySort(query.Sort, sortColumns, "name")
            .Select(r => new RoleListItemDto(r.Id, r.Name!, r.Description, r.IsSystem,
                db.RolePermissions.Count(rp => rp.RoleId == r.Id),
                db.UserRoles.Count(ur => ur.RoleId == r.Id)))
            .ToPagedResultAsync(query, ct);
    }

    public async Task<RoleDto> GetAsync(Guid id, CancellationToken ct = default) =>
        await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<RoleDto> CreateAsync(CreateRoleRequest request, CancellationToken ct = default)
    {
        guard.EnsureCanGrant(request.Permissions);
        await EnsureUniqueNameAsync(request.Name, null, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var role = new AppRole(request.Name.Trim(), request.Description.Trim());
        var result = await roleManager.CreateAsync(role);
        if (!result.Succeeded)
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["name"] = result.Errors.Select(e => e.Description).ToArray(),
            });

        db.RolePermissions.AddRange(request.Permissions.Select(p => new RolePermission(role.Id, p)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await ToDtoAsync(role, ct);
    }

    public async Task<RoleDto> UpdateAsync(Guid id, UpdateRoleRequest request, CancellationToken ct = default)
    {
        var role = await FindAsync(id, ct);
        db.EnsureVersion(role, request.Version);
        await EnsureUniqueNameAsync(request.Name, id, ct);

        var current = await db.RolePermissions.Where(rp => rp.RoleId == id).ToListAsync(ct);
        var currentCodes = current.Select(rp => rp.PermissionCode).ToHashSet();
        var requested = request.Permissions.ToHashSet();

        if (role.IsAdministrator && !requested.SetEquals(Permissions.Codes))
            throw new BusinessRuleException("admin_role_locked",
                "El rol Administrador siempre tiene todos los permisos; no se le pueden quitar.");

        // Changing (adding or removing) a permission requires holding it.
        guard.EnsureCanGrant(requested.Except(currentCodes).Concat(currentCodes.Except(requested)));
        await EnsureNotLockingOutAsync(id, requested, ct);

        role.Name = request.Name.Trim();
        role.NormalizedName = roleManager.NormalizeKey(role.Name);
        role.Description = request.Description.Trim();
        db.Entry(role).State = EntityState.Modified; // permission-only edits still bump the version

        db.RolePermissions.RemoveRange(current.Where(rp => !requested.Contains(rp.PermissionCode)));
        db.RolePermissions.AddRange(requested.Except(currentCodes).Select(p => new RolePermission(id, p)));

        await db.SaveChangesAsync(ct);
        userAccess.InvalidateAll();
        return await ToDtoAsync(role, ct);
    }

    /// <summary>The editor must keep security.roles.manage through this or another of their roles.</summary>
    private async Task EnsureNotLockingOutAsync(Guid roleId, IReadOnlySet<string> newPermissions, CancellationToken ct)
    {
        if (currentUser.UserId is not { } me || newPermissions.Contains(Permissions.SecurityRolesManage))
            return;

        var myRoleIds = await db.UserRoles.Where(ur => ur.UserId == me).Select(ur => ur.RoleId).ToListAsync(ct);
        if (!myRoleIds.Contains(roleId))
            return;

        var keepsIt = await db.RolePermissions.AnyAsync(rp =>
            rp.RoleId != roleId && myRoleIds.Contains(rp.RoleId) && rp.PermissionCode == Permissions.SecurityRolesManage, ct);
        if (!keepsIt)
            throw new BusinessRuleException("cannot_lock_yourself_out", "No puedes quitarte el permiso de administrar roles.");
    }

    private async Task EnsureUniqueNameAsync(string name, Guid? exceptId, CancellationToken ct)
    {
        var normalized = roleManager.NormalizeKey(name.Trim());
        if (await db.Roles.AnyAsync(r => r.NormalizedName == normalized && r.Id != exceptId, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["name"] = [$"El rol '{name.Trim()}' ya existe."],
            });
    }

    private async Task<AppRole> FindAsync(Guid id, CancellationToken ct) =>
        await db.Roles.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw new NotFoundException("el rol", id);

    private async Task<RoleDto> ToDtoAsync(AppRole role, CancellationToken ct)
    {
        var permissions = await db.RolePermissions.Where(rp => rp.RoleId == role.Id)
            .Select(rp => rp.PermissionCode).OrderBy(c => c).ToListAsync(ct);
        return new RoleDto(role.Id, role.Name!, role.Description, role.IsSystem, role.IsAdministrator, permissions, role.Version);
    }
}
