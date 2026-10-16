using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Sgo.Application.Inventory;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.IntegrationTests.Catalog;

namespace Sgo.IntegrationTests.Inventory;

/// <summary>The inventory engine against Postgres: persistence, atomicity and row locking (B-06).</summary>
[Collection(ApiCollection.Name)]
public class InventoryPostingTests(SgoApiFactory factory)
{
    private async Task<Guid> NewItemAsync(bool tracksLots)
    {
        var admin = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);
        var request = await admin.NewItemRequestAsync();
        return (await admin.CreateItemAsync(request with { TracksLots = tracksLots })).Id;
    }

    private static MovementRequest Req(Guid location, Guid item, decimal qty, MovementType type,
        decimal? cost = null, Guid? lot = null, Guid? docId = null) =>
        new(location, item, lot, type, qty, cost, "TEST", docId ?? Guid.NewGuid(), "T-000001", null);

    /// <summary>Runs a posting the way a use case does: transaction, PostAsync, SaveChanges, Commit.</summary>
    private async Task<IReadOnlyList<InventoryMovement>> PostAsync(params MovementRequest[] requests)
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        await using var tx = await db.Database.BeginTransactionAsync();
        var movements = await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync(requests, default);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return movements;
    }

    private async Task<Guid> CreateLotAsync(Guid itemId, string number, DateOnly? expiration)
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        await using var tx = await db.Database.BeginTransactionAsync(); // as the services do: the lot lock needs one
        var lot = await scope.ServiceProvider.GetRequiredService<ILotRegistry>()
            .GetOrCreateAsync(itemId, number, expiration, "TEST", Guid.NewGuid(), default);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return lot.Id;
    }

    private async Task<(decimal OnHand, decimal Average, int Movements)> StateAsync(Guid location, Guid item)
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var onHand = await db.StockBalances.Where(b => b.LocationId == location && b.ItemId == item).SumAsync(b => b.Quantity);
        var average = await db.ItemLocationCosts.Where(c => c.LocationId == location && c.ItemId == item)
            .Select(c => c.AverageCost).SingleOrDefaultAsync();
        var movements = await db.InventoryMovements.CountAsync(m => m.LocationId == location && m.ItemId == item);
        return (onHand, average, movements);
    }

    [Fact]
    public async Task Entries_and_exit_update_kardex_stock_and_average_cost()
    {
        var location = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(tracksLots: false);

        await PostAsync(Req(location, item, 10, MovementType.PurchaseReceipt, cost: 20));
        await PostAsync(Req(location, item, 30, MovementType.PurchaseReceipt, cost: 24));
        var exit = Assert.Single(await PostAsync(Req(location, item, -5, MovementType.TransferOut)));

        Assert.Equal((35m, 23m, 3), await StateAsync(location, item));
        Assert.Equal(23m, exit.UnitCost);
        Assert.Equal(-115m, exit.TotalCost);

        await using var scope = factory.CreateScope();
        var saved = await SgoApiFactory.Db(scope).InventoryMovements.SingleAsync(m => m.Id == exit.Id);
        Assert.Equal(("TEST", "T-000001", MovementType.TransferOut), (saved.SourceDocType, saved.SourceDocFolio, saved.Type));
        Assert.NotEqual(default, saved.BusinessDate);
    }

    [Fact]
    public async Task Insufficient_stock_records_nothing_at_all()
    {
        var location = await factory.LocationIdAsync("COM");
        var enough = await NewItemAsync(tracksLots: false);
        var scarce = await NewItemAsync(tracksLots: false);
        await PostAsync(Req(location, enough, 10, MovementType.PurchaseReceipt, cost: 5),
                        Req(location, scarce, 3, MovementType.PurchaseReceipt, cost: 5));
        var docId = Guid.NewGuid();

        var ex = await Assert.ThrowsAsync<InsufficientStockException>(() => PostAsync(
            Req(location, enough, -2, MovementType.Consumption, docId: docId),
            Req(location, scarce, -5, MovementType.Consumption, docId: docId)));

        var shortage = Assert.Single(ex.Shortages);
        Assert.Equal((scarce, 5m, 3m), (shortage.ItemId, shortage.Requested, shortage.Available));
        Assert.Equal(10m, (await StateAsync(location, enough)).OnHand);
        Assert.Equal(3m, (await StateAsync(location, scarce)).OnHand);
        await using var scope = factory.CreateScope();
        Assert.False(await SgoApiFactory.Db(scope).InventoryMovements.AnyAsync(m => m.SourceDocId == docId));
    }

    [Fact]
    public async Task Concurrent_exits_on_the_same_stock_are_serialized_by_row_locks()
    {
        var location = await factory.LocationIdAsync("FAB");
        var item = await NewItemAsync(tracksLots: false);
        await PostAsync(Req(location, item, 10, MovementType.PurchaseReceipt, cost: 8));

        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ =>
        {
            try
            {
                await PostAsync(Req(location, item, -7, MovementType.TransferOut));
                return "ok";
            }
            catch (InsufficientStockException)
            {
                return "insufficient";
            }
        }));

        Assert.Equal(["insufficient", "ok"], results.Order());
        Assert.Equal((3m, 8m, 2), await StateAsync(location, item));
    }

    [Fact]
    public async Task Exit_without_lot_is_allocated_fefo_skipping_expired_lots()
    {
        var location = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(tracksLots: true);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var expired = await CreateLotAsync(item, "L-VENCIDO", today.AddDays(-10));
        var late = await CreateLotAsync(item, "L-TARDE", today.AddDays(30));
        var early = await CreateLotAsync(item, "L-PRONTO", today.AddDays(5));
        await PostAsync(Req(location, item, 4, MovementType.PurchaseReceipt, 10, expired),
                        Req(location, item, 4, MovementType.PurchaseReceipt, 10, late),
                        Req(location, item, 4, MovementType.PurchaseReceipt, 10, early));

        var movements = await PostAsync(Req(location, item, -6, MovementType.TransferOut));

        Assert.Equal([(early, -4m), (late, -2m)], movements.Select(m => (m.LotId!.Value, m.Quantity)));

        var dispatchExpired = await Assert.ThrowsAsync<BusinessRuleException>(() =>
            PostAsync(Req(location, item, -1, MovementType.TransferOut, lot: expired)));
        Assert.Equal("lot_expired", dispatchExpired.Code);

        await PostAsync(Req(location, item, -4, MovementType.Adjustment, lot: expired)); // written off
        Assert.Equal(2m, (await StateAsync(location, item)).OnHand);
    }

    [Fact]
    public async Task Posting_requires_an_open_transaction()
    {
        var location = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(tracksLots: false);
        await using var scope = factory.CreateScope();

        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.ServiceProvider.GetRequiredService<IInventoryPostingService>()
            .PostAsync([Req(location, item, 1, MovementType.PurchaseReceipt, cost: 1)], default));
    }

    [Fact]
    public async Task Kardex_rows_cannot_be_modified_or_deleted()
    {
        var location = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(tracksLots: false);
        var movement = Assert.Single(await PostAsync(Req(location, item, 1, MovementType.PurchaseReceipt, cost: 1)));

        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlAsync($"UPDATE inventory.inventory_movement SET quantity = 99 WHERE id = {movement.Id}"));
        await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlAsync($"DELETE FROM inventory.inventory_movement WHERE id = {movement.Id}"));
    }

    [Fact]
    public async Task Existing_lot_with_a_different_expiration_is_rejected()
    {
        var item = await NewItemAsync(tracksLots: true);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var id = await CreateLotAsync(item, "L-100", today.AddDays(10));

        Assert.Equal(id, await CreateLotAsync(item, "L-100", today.AddDays(10)));
        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => CreateLotAsync(item, "L-100", today.AddDays(11)));
        Assert.Equal("lot_expiration_mismatch", ex.Code);
    }
}
