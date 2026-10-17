using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Infrastructure.Persistence;

namespace Panissimo.IntegrationTests.Infrastructure;

/// <summary>Builds catalog and stock directly in the database for tests of later modules.</summary>
public static class TestData
{
    public static async Task<Guid> LocationIdAsync(this ApiFactory factory, string code)
    {
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Locations
            .Where(l => l.Code == code).Select(l => l.Id).SingleAsync();
    }

    /// <summary>Creates an active item with a unique SKU starting with <paramref name="prefix"/>.</summary>
    public static async Task<Item> CreateItemAsync(this ApiFactory factory, string prefix, ItemType type = ItemType.RawMaterial,
        string uom = "kg", bool tracksLots = false, int? shelfLifeDays = null, ItemPresentation? presentation = null,
        string? purchaseUom = null, decimal? purchaseToBaseFactor = null)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var category = await db.ItemCategories.FirstOrDefaultAsync(c => c.Name == "Pruebas");
        if (category is null)
        {
            db.ItemCategories.Add(category = new ItemCategory("Pruebas"));
            await db.SaveChangesAsync();
        }
        var uomId = await db.UnitsOfMeasure.Where(u => u.Code == uom).Select(u => u.Id).SingleAsync();
        Guid? purchaseUomId = purchaseUom is null ? null : await db.UnitsOfMeasure.Where(u => u.Code == purchaseUom).Select(u => u.Id).SingleAsync();
        if (type == ItemType.FinishedGood)
            presentation ??= ItemPresentation.Bulk;

        // D-07: every test item gets an internal SKU (INT-…), so the OP import can find it.
        var sku = $"{prefix}-{Guid.NewGuid():N}"[..(prefix.Length + 9)];
        var item = new Item(new ItemDefinition(sku, $"INT-{sku}", $"{prefix} de prueba", type, category.Id, uomId, purchaseUomId,
            purchaseToBaseFactor, tracksLots, shelfLifeDays, StorageCondition.Ambient, 0m, presentation));
        db.Items.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    /// <summary>Posts an adjustment entry in its own transaction (stock for tests).</summary>
    public static async Task AddStockAsync(this ApiFactory factory, Guid locationId, Guid itemId, decimal quantity, decimal unitCost,
        string? lotNumber = null, DateOnly? expiration = null)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        Guid? lotId = null;
        if (lotNumber is not null)
            lotId = (await scope.ServiceProvider.GetRequiredService<ILotRegistry>()
                .GetOrCreateAsync(itemId, lotNumber, expiration, "Test", Guid.Empty, default)).Id;
        await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync(
            [new MovementRequest(locationId, itemId, lotId, MovementType.Adjustment, quantity, unitCost, "Test", Guid.Empty, "TEST", null)], default);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    /// <summary>Sets a system parameter and returns its previous value, to restore it at the end of the test.</summary>
    public static async Task<decimal> SetSettingAsync(this ApiFactory factory, string key, decimal value)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var previous = await db.GetSettingAsync(key, default);
        var setting = await db.AppSettings.SingleOrDefaultAsync(s => s.Key == key);
        if (setting is null)
            db.AppSettings.Add(new AppSetting(key, value));
        else
            setting.SetValue(value);
        await db.SaveChangesAsync();
        return previous;
    }

    public static async Task<decimal> StockAsync(this ApiFactory factory, Guid locationId, Guid itemId)
    {
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().StockBalances
            .Where(b => b.LocationId == locationId && b.ItemId == itemId).SumAsync(b => b.Quantity);
    }
}
