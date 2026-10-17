using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Persistence;

[Collection(ApiCollection.Name)]
public class PersistenceServicesTests(ApiFactory factory)
{
    [Fact]
    public async Task Folios_are_sequential_per_document_type()
    {
        await using var scope = factory.CreateScope();
        var folios = scope.ServiceProvider.GetRequiredService<IFolioGenerator>();

        var first = await folios.NextAsync(DocType.ProductionClose);
        var second = await folios.NextAsync(DocType.ProductionClose);

        Assert.Matches(@"^CP-\d{6}$", first);
        Assert.Equal(int.Parse(first[3..]) + 1, int.Parse(second[3..]));
        Assert.StartsWith("RM-", await folios.NextAsync(DocType.CustomerShipment));
    }

    [Fact]
    public async Task Transaction_lock_requires_an_open_transaction()
    {
        await using var scope = factory.CreateScope();
        var locks = scope.ServiceProvider.GetRequiredService<ITransactionLocks>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await Assert.ThrowsAsync<InvalidOperationException>(() => locks.AcquireAsync(TransactionLockScopes.Lot, "x", default));

        await using var transaction = await db.Database.BeginTransactionAsync();
        await locks.AcquireAsync(TransactionLockScopes.Lot, "x", default);
        await transaction.CommitAsync();
    }

    [Fact]
    public async Task Changes_to_audited_entities_are_logged_with_timestamps()
    {
        Guid locationId;
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var location = new Location("SUC-AUD", "Sucursal Auditoría", LocationType.Branch);
            db.Locations.Add(location);
            await db.SaveChangesAsync();
            location.Update("Sucursal Auditoría 2", "Calle 1");
            await db.SaveChangesAsync();
            locationId = location.Id;
        }

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var location = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == locationId);
            Assert.NotEqual(default, location.CreatedAt);
            Assert.NotNull(location.UpdatedAt);

            var logs = await db.AuditLogs.AsNoTracking()
                .Where(a => a.EntityType == nameof(Location) && a.EntityId == locationId.ToString())
                .OrderBy(a => a.OccurredAt).ToListAsync();
            Assert.Equal([AuditAction.Created, AuditAction.Updated], logs.Select(l => l.Action));

            using var changes = JsonDocument.Parse(logs[1].ChangesJson);
            var name = changes.RootElement.GetProperty("Name");
            Assert.Equal("Sucursal Auditoría", name.GetProperty("old").GetString());
            Assert.Equal("Sucursal Auditoría 2", name.GetProperty("new").GetString());
            Assert.False(changes.RootElement.TryGetProperty("UpdatedAt", out _));
        }
    }

    [Fact]
    public async Task User_directory_resolves_names_in_one_call()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var adminId = await db.Users.Where(u => u.Email == ApiFactory.AdminEmail).Select(u => u.Id).SingleAsync();

        var names = await scope.ServiceProvider.GetRequiredService<IUserDirectory>()
            .GetNamesAsync([adminId, null, Guid.NewGuid()], default);

        Assert.Equal("Administrador", names.Of(adminId));
        Assert.Null(names.Of(null));
        Assert.Null(names.Of(Guid.NewGuid()));
    }
}
