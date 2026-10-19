using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Sales;

namespace Panissimo.Infrastructure.Persistence.Seed;

/// <summary>
/// Base catalogs for development and the demo (<c>Seed:SampleDataFile</c>, deploy/seed/sample-data.json): sub-warehouses,
/// factories, branches, categories, items, recipes, suppliers with their items, customers with their delivery points,
/// vehicles and drivers. Like <see cref="DatabaseSeeder"/>, it only inserts what is missing (by code, SKU, RFC, plate or
/// name) and never overwrites what users edited. The E2E tests work on these records.
/// </summary>
public sealed class SampleDataSeeder(AppDbContext db, IOptions<SeedOptions> options, ILogger<SampleDataSeeder> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var path = options.Value.SampleDataFile;
        if (string.IsNullOrWhiteSpace(path))
            return;
        if (!File.Exists(path))
        {
            logger.LogWarning("Sample data file {Path} not found; no sample data is seeded", path);
            return;
        }

        SampleData data;
        await using (var stream = File.OpenRead(path))
            data = await JsonSerializer.DeserializeAsync<SampleData>(stream, Json, ct)
                   ?? throw new InvalidOperationException($"{path}: el archivo está vacío.");

        await SeedLocationsAsync(path, data.Locations, ct);
        await SeedCategoriesAsync(data.Categories, ct);
        await SeedItemsAsync(path, data.Items, ct);
        await SeedRecipesAsync(path, data.Recipes, ct);
        await SeedSuppliersAsync(path, data.Suppliers, ct);
        await SeedCustomersAsync(data.Customers, ct);
        await SeedFleetAsync(data.Vehicles, data.Drivers, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedLocationsAsync(string path, IReadOnlyList<SampleLocation> locations, CancellationToken ct)
    {
        var byCode = await db.Locations.ToDictionaryAsync(l => l.Code, StringComparer.OrdinalIgnoreCase, ct);
        foreach (var row in locations.Where(l => !byCode.ContainsKey(l.Code)))
        {
            var location = row.Type switch
            {
                LocationType.Warehouse => Location.Warehouse(row.Code, row.Name, Parent(row), row.Address),
                LocationType.Factory => Location.Factory(row.Code, row.Name, Parent(row), row.Address),
                _ => new Location(row.Code, row.Name, row.Type, row.Address),
            };
            if (row.SuppliesTypes is { Count: > 0 } supplies)
                location.SetSuppliesTypes(supplies);
            db.Locations.Add(location);
            byCode[location.Code] = location;
        }

        Location Parent(SampleLocation row) =>
            row.Parent is { } code && byCode.TryGetValue(code, out var parent)
                ? parent
                : throw new InvalidOperationException($"{path}: la ubicación {row.Code} pide la ubicación padre '{row.Parent}', que no existe.");
    }

    private async Task SeedCategoriesAsync(IReadOnlyList<string> categories, CancellationToken ct)
    {
        var existing = (await db.ItemCategories.Select(c => c.Name).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var name in categories.Where(existing.Add))
            db.ItemCategories.Add(new ItemCategory(name));
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedItemsAsync(string path, IReadOnlyList<SampleItem> items, CancellationToken ct)
    {
        var categories = await db.ItemCategories.ToDictionaryAsync(c => c.Name, c => c.Id, StringComparer.OrdinalIgnoreCase, ct);
        var units = await db.UnitsOfMeasure.ToDictionaryAsync(u => u.Code, u => u.Id, StringComparer.OrdinalIgnoreCase, ct);
        var areas = await db.ProductionAreas.ToDictionaryAsync(a => a.Name, a => a.Id, StringComparer.OrdinalIgnoreCase, ct);
        var skus = await db.Items.ToDictionaryAsync(i => i.Sku, i => i.Id, StringComparer.OrdinalIgnoreCase, ct);

        // Bulk items first: a packaged item points to its bulk one (D-05).
        foreach (var row in items.OrderBy(i => i.BulkSku is not null).Where(i => !skus.ContainsKey(i.Sku)))
        {
            var item = new Item(new ItemDefinition(
                row.Sku, row.Name, row.Type,
                Find(categories, row.Category, "la categoría", row.Sku),
                Find(units, row.BaseUom, "la unidad", row.Sku),
                row.PurchaseUom is null ? null : Find(units, row.PurchaseUom, "la unidad", row.Sku),
                row.PurchaseToBaseFactor,
                row.TracksLots,
                row.ShelfLifeDays,
                row.StorageCondition,
                row.TaxRate,
                row.Presentation,
                row.BulkSku is null ? null : Find(skus, row.BulkSku, "el artículo a granel", row.Sku),
                row.UnitsPerPackage,
                row.ProductionArea is null ? null : Find(areas, row.ProductionArea, "el área", row.Sku),
                row.ProductionMultiple,
                row.UnitWeightGrams));
            db.Items.Add(item);
            skus[item.Sku] = item.Id;
        }
        await db.SaveChangesAsync(ct);

        Guid Find(Dictionary<string, Guid> map, string key, string what, string sku) =>
            map.TryGetValue(key, out var id) ? id : throw new InvalidOperationException($"{path}: el artículo {sku} pide {what} '{key}', que no existe.");
    }

    /// <summary>Version 1 of each product that has no recipe yet (any version).</summary>
    private async Task SeedRecipesAsync(string path, IReadOnlyList<SampleRecipe> recipes, CancellationToken ct)
    {
        var skus = await db.Items.ToDictionaryAsync(i => i.Sku, i => i.Id, StringComparer.OrdinalIgnoreCase, ct);
        var factories = await db.Locations.Where(l => l.Type == LocationType.Factory)
            .ToDictionaryAsync(l => l.Code, l => l.Id, StringComparer.OrdinalIgnoreCase, ct);
        var withRecipe = (await db.Recipes.Select(r => r.OutputItemId).Distinct().ToListAsync(ct)).ToHashSet();

        foreach (var row in recipes)
        {
            var output = Sku(row.OutputSku);
            if (!withRecipe.Add(output))
                continue;
            var recipe = new Recipe(output, 1, row.YieldQty, row.Notes,
                row.Lines.Select(l => new RecipeLineInput(Sku(l.Sku), l.Quantity, l.WastePct)).ToList());
            if (row.Factory is { } factory)
                recipe.AssignFactory(factories.TryGetValue(factory, out var id)
                    ? id
                    : throw new InvalidOperationException($"{path}: la receta de {row.OutputSku} pide la fábrica '{factory}', que no existe."));
            db.Recipes.Add(recipe);
        }

        Guid Sku(string sku) =>
            skus.TryGetValue(sku, out var id) ? id : throw new InvalidOperationException($"{path}: la receta pide el artículo '{sku}', que no existe.");
    }

    private async Task SeedSuppliersAsync(string path, IReadOnlyList<SampleSupplier> suppliers, CancellationToken ct)
    {
        var skus = await db.Items.ToDictionaryAsync(i => i.Sku, i => i.Id, StringComparer.OrdinalIgnoreCase, ct);
        var byTaxId = await db.Suppliers.ToDictionaryAsync(s => s.TaxId, s => s.Id, StringComparer.OrdinalIgnoreCase, ct);
        var offers = (await db.SupplierItems.Select(si => new { si.SupplierId, si.ItemId }).ToListAsync(ct))
            .Select(o => (o.SupplierId, o.ItemId)).ToHashSet();

        foreach (var row in suppliers)
        {
            if (!byTaxId.TryGetValue(row.TaxId, out var supplierId))
            {
                var supplier = new Supplier(new SupplierDefinition(row.TaxId, row.Name, row.ContactName, row.Phone, row.Email, row.PaymentTermsDays));
                db.Suppliers.Add(supplier);
                supplierId = byTaxId[row.TaxId] = supplier.Id;
            }

            foreach (var offer in row.Items ?? [])
            {
                var itemId = skus.TryGetValue(offer.Sku, out var id)
                    ? id
                    : throw new InvalidOperationException($"{path}: el proveedor {row.TaxId} vende '{offer.Sku}', que no existe.");
                if (!offers.Add((supplierId, itemId)))
                    continue;
                var supplierItem = new SupplierItem(supplierId, itemId, offer.SupplierSku, offer.Price, offer.LeadTimeDays);
                if (offer.IsActive == false)
                    supplierItem.Deactivate();
                else if (offer.IsPreferred == true)
                    supplierItem.MarkPreferred();
                db.SupplierItems.Add(supplierItem);
            }
        }
    }

    private async Task SeedCustomersAsync(IReadOnlyList<SampleCustomer> customers, CancellationToken ct)
    {
        var byCode = await db.Customers.ToDictionaryAsync(c => c.Code, c => c.Id, StringComparer.OrdinalIgnoreCase, ct);
        var points = (await db.CustomerDeliveryPoints.Select(p => new { p.CustomerId, p.Name }).ToListAsync(ct))
            .Select(p => (p.CustomerId, p.Name.ToUpperInvariant())).ToHashSet();

        foreach (var row in customers)
        {
            if (!byCode.TryGetValue(row.Code, out var customerId))
            {
                var customer = new Customer(row.Code, new CustomerDefinition(row.Name, row.TaxId, row.ContactName, row.Phone, row.Email, row.Notes));
                db.Customers.Add(customer);
                customerId = byCode[row.Code] = customer.Id;
            }
            foreach (var point in (row.DeliveryPoints ?? []).Where(p => points.Add((customerId, p.Name.ToUpperInvariant()))))
                db.CustomerDeliveryPoints.Add(new CustomerDeliveryPoint(customerId, point.Name, point.Address));
        }
    }

    private async Task SeedFleetAsync(IReadOnlyList<SampleVehicle> vehicles, IReadOnlyList<SampleDriver> drivers, CancellationToken ct)
    {
        var plates = (await db.Vehicles.Select(v => v.Plate).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var row in vehicles.Where(v => plates.Add(v.Plate)))
            db.Vehicles.Add(new Vehicle(row.Plate, row.Description));

        var names = (await db.Drivers.Select(d => d.Name).ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var row in drivers.Where(d => names.Add(d.Name)))
            db.Drivers.Add(new Driver(row.Name, row.Phone));
    }

    private sealed record SampleData(
        IReadOnlyList<SampleLocation> Locations,
        IReadOnlyList<string> Categories,
        IReadOnlyList<SampleItem> Items,
        IReadOnlyList<SampleRecipe> Recipes,
        IReadOnlyList<SampleSupplier> Suppliers,
        IReadOnlyList<SampleCustomer> Customers,
        IReadOnlyList<SampleVehicle> Vehicles,
        IReadOnlyList<SampleDriver> Drivers);

    private sealed record SampleLocation(string Code, string Name, LocationType Type, string? Parent, string? Address, IReadOnlyList<ItemType>? SuppliesTypes);

    private sealed record SampleItem(
        string Sku, string Name, ItemType Type, string Category, string BaseUom, string? PurchaseUom, decimal? PurchaseToBaseFactor,
        bool TracksLots, int? ShelfLifeDays, StorageCondition StorageCondition, decimal TaxRate, ItemPresentation? Presentation,
        string? BulkSku, int? UnitsPerPackage, string? ProductionArea, decimal? ProductionMultiple, decimal? UnitWeightGrams);

    private sealed record SampleRecipe(string OutputSku, decimal YieldQty, string? Notes, string? Factory, IReadOnlyList<SampleRecipeLine> Lines);

    private sealed record SampleRecipeLine(string Sku, decimal Quantity, decimal WastePct);

    private sealed record SampleSupplier(
        string TaxId, string Name, string? ContactName, string? Phone, string? Email, int PaymentTermsDays, IReadOnlyList<SampleSupplierItem>? Items);

    private sealed record SampleSupplierItem(string Sku, string? SupplierSku, decimal Price, int LeadTimeDays, bool? IsPreferred, bool? IsActive);

    private sealed record SampleCustomer(
        string Code, string Name, string? TaxId, string? ContactName, string? Phone, string? Email, string? Notes,
        IReadOnlyList<SampleDeliveryPoint>? DeliveryPoints);

    private sealed record SampleDeliveryPoint(string Name, string? Address);

    private sealed record SampleVehicle(string Plate, string Description);

    private sealed record SampleDriver(string Name, string? Phone);
}
