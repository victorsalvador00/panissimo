using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sgo.Domain.Organization;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence.Seed;

namespace Sgo.IntegrationTests.Persistence;

[Collection(ApiCollection.Name)]
public class MigrationAndSeedTests(SgoApiFactory factory)
{
    [Fact]
    public async Task All_migrations_are_applied()
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);

        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Contains("20260924013454_InitialCreate", await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    public async Task Seed_creates_base_data()
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);

        var codes = await db.Locations.Select(l => l.Code).ToListAsync();
        Assert.Contains("SUC-01", codes);
        Assert.Contains("SUC-10", codes);
        Assert.Contains("FAB", codes);
        Assert.Contains("COM", codes);
        Assert.Equal(LocationType.Commissary, (await db.Locations.SingleAsync(l => l.Code == "COM")).Type);

        var uomCodes = await db.UnitsOfMeasure.Select(u => u.Code).ToListAsync();
        Assert.All(DatabaseSeeder.UnitsOfMeasure, u => Assert.Contains(u.Code, uomCodes));
        Assert.Equal("0", (await db.AppSettings.SingleAsync(s => s.Key == AppSettingKeys.PoApprovalThreshold)).Value);
        Assert.Equal("3", (await db.AppSettings.SingleAsync(s => s.Key == AppSettingKeys.ExpirationAlertDays)).Value);

        var roleNames = await db.Roles.Select(r => r.Name).ToListAsync();
        Assert.All(SystemRoles.All, r => Assert.Contains(r.Name, roleNames));

        var admin = await db.Users.SingleAsync(u => u.Email == SgoApiFactory.AdminEmail);
        var adminRoleId = await db.Roles.Where(r => r.Name == SystemRoles.Administrator).Select(r => r.Id).SingleAsync();
        Assert.True(await db.UserRoles.AnyAsync(ur => ur.UserId == admin.Id && ur.RoleId == adminRoleId));
        Assert.Equal(Permissions.Codes.Count, await db.RolePermissions.CountAsync(rp => rp.RoleId == adminRoleId));
    }

    [Fact]
    public async Task Seed_is_idempotent()
    {
        var before = await CountsAsync();

        await using (var scope = factory.CreateScope())
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
        await using (var scope = factory.CreateScope())
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();

        Assert.Equal(before, await CountsAsync());
    }

    [Fact]
    public async Task Seed_does_not_overwrite_edited_data()
    {
        await using (var scope = factory.CreateScope())
        {
            var db = SgoApiFactory.Db(scope);
            var branch = await db.Locations.SingleAsync(l => l.Code == "SUC-02");
            branch.Update("Sucursal Centro", branch.Type, "Av. Juárez 1");
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.CreateScope())
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();

        await using (var scope = factory.CreateScope())
            Assert.Equal("Sucursal Centro", (await SgoApiFactory.Db(scope).Locations.SingleAsync(l => l.Code == "SUC-02")).Name);
    }

    private async Task<(int Locations, int Uoms, int Settings, int Roles, int RolePermissions, int Users)> CountsAsync()
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        return (await db.Locations.CountAsync(), await db.UnitsOfMeasure.CountAsync(), await db.AppSettings.CountAsync(),
            await db.Roles.CountAsync(), await db.RolePermissions.CountAsync(), await db.Users.CountAsync());
    }
}
