using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Identity;

namespace Panissimo.Infrastructure.Persistence.Seed;

public sealed class SeedOptions
{
    public const string Section = "Seed";
    public const string DefaultLocationsCsv = "deploy/seed/locations.csv";

    public string? AdminEmail { get; set; }
    public string? AdminPassword { get; set; }

    /// <summary>Branches to seed (<c>codigo,nombre,direccion</c>), D-01. Missing file = only the plant.</summary>
    public string LocationsCsv { get; set; } = DefaultLocationsCsv;

    /// <summary>
    /// D-01: create the plant's four sub-warehouses when it has none and no stock. Integration tests turn it off to keep a
    /// plant without sub-warehouses (stock on the plant itself) and create their own plants with sub-warehouses.
    /// </summary>
    public bool PlantWarehouses { get; set; } = true;
}

/// <summary>
/// Idempotent base data (backend §4). Only inserts what is missing and never overwrites data users may have
/// edited (location and area names, role permissions, setting values).
/// </summary>
public sealed class DatabaseSeeder(
    AppDbContext db,
    RoleManager<AppRole> roleManager,
    UserManager<AppUser> userManager,
    IOptions<SeedOptions> options,
    ILogger<DatabaseSeeder> logger)
{
    public static readonly IReadOnlyList<(string Code, string Name, UomKind Kind)> UnitsOfMeasure =
    [
        ("kg", "Kilogramo", UomKind.Mass),
        ("g", "Gramo", UomKind.Mass),
        ("l", "Litro", UomKind.Volume),
        ("ml", "Mililitro", UomKind.Volume),
        ("pza", "Pieza", UomKind.Unit),
        ("caja", "Caja", UomKind.Unit),
        ("bulto", "Bulto", UomKind.Unit),
        ("paq", "Paquete", UomKind.Unit),
    ];

    public static readonly IReadOnlyList<(string Code, string Name)> ProductionAreas =
    [
        ("BIZ-DIA", "Bizcocho Día"),
        ("SAL-DIA", "Pan de Sal Día"),
        ("SAL-NOC", "Pan de Sal Noche"),
        ("RONDO", "Rondo"),
        ("REPOST", "Repostería"),
        ("PANQ", "Panquelería"),
        ("PAST", "Pastelería"),
        ("CONG", "Congelado"),
        ("BOCAD", "Bocadillos"),
        ("MASAS", "Masas"),
        ("EMPAQ", "Empaque"),
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        await SeedLocationsAsync(ct);
        await SeedUnitsOfMeasureAsync(ct);
        await SeedProductionAreasAsync(ct);
        await SeedSettingsAsync(ct);
        await db.SaveChangesAsync(ct);
        if (options.Value.PlantWarehouses)
            await SeedPlantWarehousesAsync(ct);

        await SeedRolesAsync(ct);
        await SeedAdminAsync(ct);
    }

    private async Task SeedLocationsAsync(CancellationToken ct)
    {
        var existing = (await db.Locations.Select(l => l.Code).ToListAsync(ct)).ToHashSet();
        var wanted = new List<Location> { new(Location.PlantCode, "Planta", LocationType.Plant) };
        wanted.AddRange(ReadBranches(options.Value.LocationsCsv));

        foreach (var location in wanted.Where(l => !existing.Contains(l.Code)))
            db.Locations.Add(location);
    }

    /// <summary>D-01 starting sub-warehouses of the plant (editable afterwards).</summary>
    public static readonly IReadOnlyList<(string Suffix, string Name)> PlantWarehouses =
    [
        ("MP", "Materias primas"),
        ("INS", "Insumos y empaque"),
        ("SEMI", "Semiterminados"),
        ("PT", "Producto terminado"),
    ];

    /// <summary>Only on a plant without sub-warehouses and without stock (RN-44); never touches existing ones.</summary>
    private async Task SeedPlantWarehousesAsync(CancellationToken ct)
    {
        var plant = await db.Locations.SingleAsync(l => l.Code == Location.PlantCode, ct);
        if (await db.Locations.AnyAsync(l => l.ParentLocationId == plant.Id, ct)
            || await db.StockBalances.AnyAsync(b => b.LocationId == plant.Id && b.Quantity != 0, ct))
            return;
        db.Locations.AddRange(PlantWarehouses.Select(w => Location.Warehouse($"{Location.PlantCode}-{w.Suffix}", w.Name, plant)));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Branches from the seed CSV. A malformed file stops the seed: it is deployment data, not user input.</summary>
    private List<Location> ReadBranches(string path)
    {
        if (!File.Exists(path))
        {
            logger.LogWarning("Branch seed file {Path} not found; only the plant is seeded", path);
            return [];
        }

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            PrepareHeaderForMatch = args => args.Header.Trim().ToLowerInvariant(),
            TrimOptions = TrimOptions.Trim,
            DetectDelimiter = true,
        };
        using var reader = new StreamReader(path);
        using var csv = new CsvReader(reader, config);

        var branches = new List<Location>();
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!csv.Read() || !csv.ReadHeader())
            return branches;
        csv.ValidateHeader(typeof(BranchRow));

        while (csv.Read())
        {
            var row = csv.GetRecord<BranchRow>();
            var line = csv.Parser.Row;
            if (string.IsNullOrWhiteSpace(row.Codigo) || string.IsNullOrWhiteSpace(row.Nombre))
                throw new InvalidOperationException($"{path}, fila {line}: codigo y nombre son obligatorios.");
            if (string.Equals(row.Codigo, Location.PlantCode, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException($"{path}, fila {line}: {Location.PlantCode} es la planta, no una sucursal.");
            if (!codes.Add(row.Codigo))
                throw new InvalidOperationException($"{path}, fila {line}: el código {row.Codigo} está repetido.");
            branches.Add(new Location(row.Codigo, row.Nombre, LocationType.Branch, row.Direccion));
        }

        return branches;
    }

    private sealed class BranchRow
    {
        public string Codigo { get; set; } = "";
        public string Nombre { get; set; } = "";
        public string? Direccion { get; set; }
    }

    private async Task SeedUnitsOfMeasureAsync(CancellationToken ct)
    {
        var existing = await db.UnitsOfMeasure.Select(u => u.Code).ToListAsync(ct);
        foreach (var (code, name, kind) in UnitsOfMeasure.Where(u => !existing.Contains(u.Code)))
            db.UnitsOfMeasure.Add(new UnitOfMeasure(code, name, kind));
    }

    private async Task SeedProductionAreasAsync(CancellationToken ct)
    {
        var existing = await db.ProductionAreas.Select(a => a.Code).ToListAsync(ct);
        foreach (var (area, index) in ProductionAreas.Select((a, i) => (a, i)).Where(x => !existing.Contains(x.a.Code)))
            db.ProductionAreas.Add(new ProductionArea(area.Code, area.Name, (index + 1) * 10));
    }

    private async Task SeedSettingsAsync(CancellationToken ct)
    {
        var existing = await db.AppSettings.Select(s => s.Key).ToListAsync(ct);
        foreach (var definition in SettingDefinitions.All.Where(d => !existing.Contains(d.Key)))
            db.AppSettings.Add(new AppSetting(definition.Key, definition.Default));
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

    private async Task SeedAdminAsync(CancellationToken ct)
    {
        var (email, password) = (options.Value.AdminEmail, options.Value.AdminPassword);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Seed:AdminEmail / Seed:AdminPassword not set; skipping administrator user");
            return;
        }

        if (await userManager.FindByEmailAsync(email) is not null)
            return;

        var plant = await db.Locations.SingleAsync(l => l.Code == Location.PlantCode, ct);
        var admin = new AppUser(email, "Administrador") { EmailConfirmed = true, DefaultLocationId = plant.Id };
        EnsureSucceeded(await userManager.CreateAsync(admin, password), "create administrator");
        var adminRole = await db.Roles.SingleAsync(r => r.SystemKey == SystemRoles.AdministratorKey, ct);
        EnsureSucceeded(await userManager.AddToRoleAsync(admin, adminRole.Name!), "assign administrator role");
        db.UserLocations.Add(new UserLocation(admin.Id, plant.Id));
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Administrator user created");
    }

    private static void EnsureSucceeded(IdentityResult result, string operation)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Seed failed to {operation}: {string.Join("; ", result.Errors.Select(e => e.Description))}");
    }
}
