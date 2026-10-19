using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Infrastructure.Persistence;
using Panissimo.Infrastructure.Persistence.Seed;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Persistence;

/// <summary>Its own database: the sample data gives the plant factories, which changes RN-49 for the shared one.</summary>
[CollectionDefinition(Name)]
public sealed class SampleDataCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "sample-data";
}

[Collection(SampleDataCollection.Name)]
public class SampleDataSeedTests(ApiFactory factory)
{
    private static readonly string File = Path.Combine(AppContext.BaseDirectory, "Fixtures", "sample-data.json");

    private static SampleDataSeeder Seeder(AppDbContext db) =>
        new(db, Options.Create(new SeedOptions { SampleDataFile = File }), NullLogger<SampleDataSeeder>.Instance);

    [Fact]
    public async Task The_deploy_file_loads_the_base_catalogs_once_and_keeps_user_edits()
    {
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await Seeder(db).SeedAsync();
        }

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var warehouses = await db.Locations.AsNoTracking().Where(l => l.Code.StartsWith("PLANTA-")).ToListAsync();
            Assert.Equal(["PLANTA-INS", "PLANTA-MP", "PLANTA-PT"], warehouses.Select(w => w.Code).Order());
            Assert.True(warehouses.Single(w => w.Code == "PLANTA-MP").Supplies(ItemType.RawMaterial));
            Assert.Equal(LocationType.Factory, (await db.Locations.SingleAsync(l => l.Code == "FABRICA-PT")).Type);
            Assert.Equal(LocationType.Branch, (await db.Locations.SingleAsync(l => l.Code == "SUC-001")).Type);

            var packaged = await db.Items.AsNoTracking().SingleAsync(i => i.Sku == "PT-020-DONA-EMP");
            var bulk = await db.Items.AsNoTracking().SingleAsync(i => i.Sku == "PT-020-DONA");
            Assert.Equal(bulk.Id, packaged.BulkItemId);
            var recipe = await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleAsync(r => r.OutputItemId == bulk.Id);
            Assert.Equal((1, 20m, 8), (recipe.VersionNumber, recipe.YieldQty, recipe.Lines.Count));
            Assert.Equal((await db.Locations.SingleAsync(l => l.Code == "FABRICA-PT")).Id, recipe.FactoryId);

            Assert.Equal(9, await db.SupplierItems.CountAsync());
            Assert.Single(await db.CustomerDeliveryPoints.ToListAsync());
            Assert.Equal(5, await db.Vehicles.CountAsync(v => v.Plate.StartsWith("PRB-")));
            Assert.Equal(5, await db.Drivers.CountAsync(d => d.Name.EndsWith("(prueba)")));

            // A user edit survives the next start.
            var flour = await db.Items.SingleAsync(i => i.Sku == "MP-001");
            db.Entry(flour).Property(i => i.Name).CurrentValue = "Harina de trigo (editada)";
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var before = await CountsAsync(db);
            await Seeder(db).SeedAsync();
            Assert.Equal(before, await CountsAsync(db));
            Assert.Equal("Harina de trigo (editada)", (await db.Items.AsNoTracking().SingleAsync(i => i.Sku == "MP-001")).Name);
        }
    }

    private static async Task<int[]> CountsAsync(AppDbContext db) =>
    [
        await db.Locations.CountAsync(), await db.ItemCategories.CountAsync(), await db.Items.CountAsync(), await db.Recipes.CountAsync(),
        await db.Suppliers.CountAsync(), await db.SupplierItems.CountAsync(), await db.Customers.CountAsync(),
        await db.CustomerDeliveryPoints.CountAsync(), await db.Vehicles.CountAsync(), await db.Drivers.CountAsync(),
    ];
}
