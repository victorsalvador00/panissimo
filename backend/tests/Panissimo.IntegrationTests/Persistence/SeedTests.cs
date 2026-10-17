using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Persistence;
using Panissimo.Infrastructure.Persistence.Seed;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Persistence;

[Collection(ApiCollection.Name)]
public class SeedTests(ApiFactory factory)
{
    [Fact]
    public async Task Seed_creates_the_plant_and_the_branches_of_the_csv()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var locations = await db.Locations.AsNoTracking().OrderBy(l => l.Code).ToListAsync();

        Assert.Contains(locations, l => l is { Code: "PLANTA", Type: LocationType.Plant, CanProduce: true });
        // Other tests of the collection add their own branches.
        var branches = locations.Where(l => l.Type == LocationType.Branch && l.Code.StartsWith("SUC-0")).ToList();
        Assert.Equal(["SUC-01", "SUC-02"], branches.Select(b => b.Code));
        Assert.Equal("Av. Juárez 100, Centro", branches[0].Address);
        Assert.Null(branches[1].Address);
    }

    [Fact]
    public async Task Seed_creates_units_areas_and_settings_with_defaults()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Other tests of the collection add their own units and areas.
        var units = await db.UnitsOfMeasure.Select(u => u.Code).ToListAsync();
        Assert.All(DatabaseSeeder.UnitsOfMeasure, u => Assert.Contains(u.Code, units));
        var areas = await db.ProductionAreas.Select(a => a.Code).ToListAsync();
        Assert.All(DatabaseSeeder.ProductionAreas, a => Assert.Contains(a.Code, areas));

        var settings = await db.AppSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.DecimalValue);
        Assert.Equal(SettingDefinitions.All.Count, settings.Count);
        Assert.Equal(10m, settings[AppSettingKeys.OverrunTolerancePct]);
        Assert.Equal(3m, settings[AppSettingKeys.ExpiryAlertDays]);
    }

    [Fact]
    public async Task Seed_creates_the_ten_roles_with_their_permissions_and_the_administrator()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var roles = await db.Roles.AsNoTracking().ToListAsync();
        Assert.Equal(10, roles.Count);
        foreach (var definition in SystemRoles.All)
        {
            var role = Assert.Single(roles, r => r.SystemKey == definition.Key);
            var granted = await db.RolePermissions.Where(rp => rp.RoleId == role.Id).Select(rp => rp.PermissionCode).ToListAsync();
            Assert.Equal(definition.Permissions.Order(), granted.Order());
        }

        var admin = await db.Users.AsNoTracking().SingleAsync(u => u.Email == ApiFactory.AdminEmail);
        var adminRole = roles.Single(r => r.SystemKey == SystemRoles.AdministratorKey);
        Assert.True(await db.UserRoles.AnyAsync(ur => ur.UserId == admin.Id && ur.RoleId == adminRole.Id));
        var plant = await db.Locations.SingleAsync(l => l.Code == Location.PlantCode);
        Assert.Equal(plant.Id, admin.DefaultLocationId);
        Assert.True(await db.UserLocations.AnyAsync(ul => ul.UserId == admin.Id && ul.LocationId == plant.Id));
    }

    [Fact]
    public async Task Seed_is_idempotent_and_keeps_user_edits()
    {
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var area = await db.ProductionAreas.SingleAsync(a => a.Code == "RONDO");
            area.Update("Rondo (editada)", area.SortOrder);
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var before = (await db.Locations.CountAsync(), await db.Roles.CountAsync(), await db.RolePermissions.CountAsync(),
                await db.Users.CountAsync(), await db.ProductionAreas.CountAsync(), await db.AppSettings.CountAsync());

            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();

            var after = (await db.Locations.CountAsync(), await db.Roles.CountAsync(), await db.RolePermissions.CountAsync(),
                await db.Users.CountAsync(), await db.ProductionAreas.CountAsync(), await db.AppSettings.CountAsync());
            Assert.Equal(before, after);
            Assert.Equal("Rondo (editada)", (await db.ProductionAreas.AsNoTracking().SingleAsync(a => a.Code == "RONDO")).Name);
        }
    }
}
