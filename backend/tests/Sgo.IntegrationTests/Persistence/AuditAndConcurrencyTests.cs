using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Domain.Organization;
using Sgo.Domain.Security;

namespace Sgo.IntegrationTests.Persistence;

[Collection(ApiCollection.Name)]
public class AuditAndConcurrencyTests(SgoApiFactory factory)
{
    private static string NewCode() => "T-" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();

    private async Task<Location> CreateLocationAsync(string name = "Prueba")
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var location = new Location(NewCode(), name, LocationType.Branch);
        db.Locations.Add(location);
        await db.SaveChangesAsync();
        return location;
    }

    [Fact]
    public async Task Creating_an_audited_entity_writes_audit_log_and_timestamps()
    {
        var location = await CreateLocationAsync("Sucursal Norte");

        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var saved = await db.Locations.SingleAsync(l => l.Id == location.Id);
        Assert.NotEqual(default, saved.CreatedAt);
        Assert.Null(saved.UpdatedAt);

        var log = await db.AuditLogs.SingleAsync(a => a.EntityId == location.Id.ToString());
        Assert.Equal(AuditAction.Created, log.Action);
        Assert.Equal(nameof(Location), log.EntityType);
        Assert.Equal("Sucursal Norte", JsonDocument.Parse(log.ChangesJson).RootElement.GetProperty("Name").GetString());
    }

    [Fact]
    public async Task Updating_an_audited_entity_records_old_and_new_values()
    {
        var location = await CreateLocationAsync("Antes");

        await using (var scope = factory.CreateScope())
        {
            var db = SgoApiFactory.Db(scope);
            var loaded = await db.Locations.SingleAsync(l => l.Id == location.Id);
            loaded.Update("Después", loaded.Type, null);
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.CreateScope())
        {
            var db = SgoApiFactory.Db(scope);
            Assert.NotNull((await db.Locations.SingleAsync(l => l.Id == location.Id)).UpdatedAt);

            var log = await db.AuditLogs.SingleAsync(a => a.EntityId == location.Id.ToString() && a.Action == AuditAction.Updated);
            var name = JsonDocument.Parse(log.ChangesJson).RootElement.GetProperty("Name");
            Assert.Equal("Antes", name.GetProperty("old").GetString());
            Assert.Equal("Después", name.GetProperty("new").GetString());
        }
    }

    [Fact]
    public async Task Version_changes_on_every_update()
    {
        var location = await CreateLocationAsync();

        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var loaded = await db.Locations.SingleAsync(l => l.Id == location.Id);
        var before = loaded.Version;
        loaded.Deactivate();
        await db.SaveChangesAsync();

        Assert.NotEqual(0u, before);
        Assert.NotEqual(before, loaded.Version);
    }

    [Fact]
    public async Task Concurrent_update_with_stale_version_fails()
    {
        var location = await CreateLocationAsync();

        await using var scopeA = factory.CreateScope();
        await using var scopeB = factory.CreateScope();
        var dbA = SgoApiFactory.Db(scopeA);
        var dbB = SgoApiFactory.Db(scopeB);
        var a = await dbA.Locations.SingleAsync(l => l.Id == location.Id);
        var b = await dbB.Locations.SingleAsync(l => l.Id == location.Id);

        a.Update("Primero", a.Type, null);
        await dbA.SaveChangesAsync();

        b.Update("Segundo", b.Type, null);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => dbB.SaveChangesAsync());
    }

    [Fact]
    public async Task EnsureVersion_rejects_version_sent_by_client_when_outdated()
    {
        var location = await CreateLocationAsync();

        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var loaded = await db.Locations.SingleAsync(l => l.Id == location.Id);

        Assert.Throws<ConcurrencyException>(() => db.EnsureVersion(loaded, loaded.Version + 1));
    }
}
