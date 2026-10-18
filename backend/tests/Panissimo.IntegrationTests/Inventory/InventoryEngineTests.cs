using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class InventoryEngineTests(ApiFactory factory)
{
    private static MovementRequest Exit(Guid location, Guid item, decimal qty, MovementType type = MovementType.Waste) =>
        new(location, item, null, type, -qty, null, "Test", Guid.Empty, "TEST", null);

    [Fact]
    public async Task Posting_outside_a_transaction_is_refused()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("SAL");
        await using var scope = factory.CreateScope();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync([Exit(plant, item.Id, 1)], default));
    }

    [Fact]
    public async Task Entries_and_exits_update_balance_cost_and_kardex()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("AZU");

        await factory.AddStockAsync(plant, item.Id, 10, 20);
        await factory.AddStockAsync(plant, item.Id, 30, 24);
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync([Exit(plant, item.Id, 15)], default);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        }

        await using var check = factory.CreateScope();
        var context = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(25m, await factory.StockAsync(plant, item.Id));
        Assert.Equal(23m, (await context.ItemLocationCosts.SingleAsync(c => c.LocationId == plant && c.ItemId == item.Id)).AverageCost);
        var kardex = await context.InventoryMovements.Where(m => m.ItemId == item.Id).OrderBy(m => m.Sequence).ToListAsync();
        Assert.Equal([10m, 30m, -15m], kardex.Select(m => m.Quantity));
        Assert.Equal(-345m, kardex[2].TotalCost);
    }

    [Fact]
    public async Task Insufficient_stock_leaves_nothing_registered()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("LEV");
        await factory.AddStockAsync(plant, item.Id, 5, 10);

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            var error = await Assert.ThrowsAsync<InsufficientStockException>(() =>
                scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync(
                    [Exit(plant, item.Id, 2), Exit(plant, item.Id, 4)], default));
            Assert.Equal((6m, 5m), (error.Shortages.Single().Requested, error.Shortages.Single().Available));
        }

        Assert.Equal(5m, await factory.StockAsync(plant, item.Id));
    }

    [Fact]
    public async Task Concurrent_exits_never_leave_negative_stock()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("MAN");
        await factory.AddStockAsync(plant, item.Id, 10, 10);

        async Task<bool> TryExitAsync()
        {
            await using var scope = factory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync();
            try
            {
                await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync([Exit(plant, item.Id, 7)], default);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return true;
            }
            catch (InsufficientStockException)
            {
                return false;
            }
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => TryExitAsync()));

        Assert.Equal(1, results.Count(ok => ok));
        Assert.Equal(3m, await factory.StockAsync(plant, item.Id));
    }

    [Fact]
    public async Task Concurrent_documents_with_the_same_new_lot_share_it()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("CRE", tracksLots: true);
        var expiration = new DateOnly(2027, 1, 31);

        var postings = Enumerable.Range(0, 4).Select(_ => factory.AddStockAsync(plant, item.Id, 5, 30, "L-2610", expiration));
        await Task.WhenAll(postings);

        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Single(await db.Lots.Where(l => l.ItemId == item.Id).ToListAsync());
        Assert.Equal(20m, await factory.StockAsync(plant, item.Id));
    }

    [Fact]
    public async Task Existing_lot_with_a_different_expiration_is_rejected()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("QSO", tracksLots: true);
        await factory.AddStockAsync(plant, item.Id, 5, 30, "L-1", new DateOnly(2027, 1, 31));

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            factory.AddStockAsync(plant, item.Id, 5, 30, "L-1", new DateOnly(2027, 2, 28)));

        Assert.Equal("lot_expiration_mismatch", error.Code);
    }

    [Fact]
    public async Task Lot_allocator_previews_fefo_without_expired_lots()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("PAN", ItemType.FinishedGood, "pza", tracksLots: true);
        var today = ApiFactory.Today;
        await factory.AddStockAsync(plant, item.Id, 10, 2, "VENCIDO", today.AddDays(-2));
        await factory.AddStockAsync(plant, item.Id, 5, 2, "MANANA", today.AddDays(1));
        await factory.AddStockAsync(plant, item.Id, 5, 2, "SEMANA", today.AddDays(7));

        await using var scope = factory.CreateScope();
        var allocator = scope.ServiceProvider.GetRequiredService<ILotAllocator>();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lots = await db.Lots.Where(l => l.ItemId == item.Id).ToDictionaryAsync(l => l.Id, l => l.LotNumber);

        var allocation = await allocator.AllocateAsync(plant, item.Id, 7, default);
        Assert.Equal([("MANANA", 5m), ("SEMANA", 2m)], allocation.Select(a => (lots[a.LotId], a.Quantity)));

        var shortage = await Assert.ThrowsAsync<InsufficientStockException>(() => allocator.AllocateAsync(plant, item.Id, 11, default));
        Assert.Equal(10m, shortage.Shortages.Single().Available);
    }
}
