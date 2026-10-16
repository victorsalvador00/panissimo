using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sgo.Domain.Catalog;
using Sgo.Domain.Organization;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Identity;

namespace Sgo.Infrastructure.Persistence.Seed;

public sealed class SeedOptions
{
    public const string Section = "Seed";

    public string? AdminEmail { get; set; }
    public string? AdminPassword { get; set; }
}

/// <summary>
/// Idempotent base data (backend spec §4). Only inserts what is missing and never overwrites
/// data users may have edited (location names, role permissions, setting values).
/// </summary>
public sealed class DatabaseSeeder(
    SgoDbContext db,
    RoleManager<AppRole> roleManager,
    UserManager<AppUser> userManager,
    IOptions<SeedOptions> options,
    ILogger<DatabaseSeeder> logger)
{
    public static readonly IReadOnlyList<(string Code, string Name, LocationType Type)> Locations =
    [
        .. Enumerable.Range(1, 10).Select(i => ($"SUC-{i:D2}", $"Sucursal {i:D2}", LocationType.Branch)),
        ("FAB", "Fábrica", LocationType.Factory),
        ("COM", "Comisariato", LocationType.Commissary),
    ];

    public static readonly IReadOnlyList<(string Code, string Name, UomKind Kind)> UnitsOfMeasure =
    [
        ("kg", "Kilogramo", UomKind.Mass),
        ("g", "Gramo", UomKind.Mass),
        ("l", "Litro", UomKind.Volume),
        ("ml", "Mililitro", UomKind.Volume),
        ("pza", "Pieza", UomKind.Unit),
        ("caja", "Caja", UomKind.Unit),
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await SeedLocationsAsync(ct);
        await SeedUnitsOfMeasureAsync(ct);
        await SeedSettingsAsync(ct);
        await db.SaveChangesAsync(ct);

        await SeedRolesAsync(ct);
        await SeedAdminAsync();
    }

    private async Task SeedLocationsAsync(CancellationToken ct)
    {
        var existing = await db.Locations.Select(l => l.Code).ToListAsync(ct);
        foreach (var (code, name, type) in Locations.Where(l => !existing.Contains(l.Code)))
            db.Locations.Add(new Location(code, name, type));
    }

    private async Task SeedUnitsOfMeasureAsync(CancellationToken ct)
    {
        var existing = await db.UnitsOfMeasure.Select(u => u.Code).ToListAsync(ct);
        foreach (var (code, name, kind) in UnitsOfMeasure.Where(u => !existing.Contains(u.Code)))
            db.UnitsOfMeasure.Add(new UnitOfMeasure(code, name, kind));
    }

    private async Task SeedSettingsAsync(CancellationToken ct)
    {
        var existing = await db.AppSettings.Select(s => s.Key).ToListAsync(ct);
        foreach (var setting in AppSettingKeys.Defaults.Where(s => !existing.Contains(s.Key)))
            db.AppSettings.Add(new AppSetting(setting.Key, setting.Value, setting.Description));
    }

    private async Task SeedRolesAsync(CancellationToken ct)
    {
        foreach (var definition in SystemRoles.All)
        {
            var role = await db.Roles.SingleOrDefaultAsync(r => r.SystemKey == definition.Key, ct);
            if (role is null)
            {
                role = new AppRole(definition.Name, definition.Description, definition.Key);
                EnsureSucceeded(await roleManager.CreateAsync(role), $"create role {definition.Name}");
                db.RolePermissions.AddRange(definition.Permissions.Select(p => new RolePermission(role.Id, p)));
            }
            else if (role.IsAdministrator)
            {
                // "Todos": the administrator also receives permissions added in later versions.
                var granted = await db.RolePermissions.Where(rp => rp.RoleId == role.Id)
                    .Select(rp => rp.PermissionCode).ToListAsync(ct);
                db.RolePermissions.AddRange(definition.Permissions.Except(granted).Select(p => new RolePermission(role.Id, p)));
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedAdminAsync()
    {
        var (email, password) = (options.Value.AdminEmail, options.Value.AdminPassword);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Seed:AdminEmail / Seed:AdminPassword not set; skipping administrator user");
            return;
        }

        if (await userManager.FindByEmailAsync(email) is not null)
            return;

        var admin = new AppUser(email, "Administrador") { EmailConfirmed = true };
        EnsureSucceeded(await userManager.CreateAsync(admin, password), "create administrator");
        var adminRole = await db.Roles.SingleAsync(r => r.SystemKey == SystemRoles.AdministratorKey);
        EnsureSucceeded(await userManager.AddToRoleAsync(admin, adminRole.Name!), "assign administrator role");
        logger.LogInformation("Administrator user created");
    }

    private static void EnsureSucceeded(IdentityResult result, string operation)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Seed failed to {operation}: {string.Join("; ", result.Errors.Select(e => e.Description))}");
    }
}
