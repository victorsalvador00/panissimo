using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Application.Sales;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Sales;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

/// <summary>B-26c (RN-45): every process chooses its sub-warehouse. Tests use their own plant with the four sub-warehouses.</summary>
[Collection(ApiCollection.Name)]
public class WarehouseProcessTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;
    private static string Code(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..(prefix.Length + 5)].ToUpperInvariant();

    private sealed record Site(LocationDto Plant, LocationDto Mp, LocationDto Ins, LocationDto Semi, LocationDto Pt);

    private static async Task<LocationDto> LocationAsync(HttpClient admin, CreateLocationRequest request)
    {
        var response = await admin.PostJsonAsync("/api/v1/locations", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<LocationDto>())!;
    }

    private static async Task<Site> PlantAsync(HttpClient admin)
    {
        var plant = await LocationAsync(admin, new CreateLocationRequest(Code("PLT"), "Planta de prueba", LocationType.Plant, null));
        async Task<LocationDto> Warehouse(string suffix, string name) =>
            await LocationAsync(admin, new CreateLocationRequest($"{plant.Code}-{suffix}", name, LocationType.Warehouse, null, plant.Id));
        return new Site(plant, await Warehouse("MP", "Materias primas"), await Warehouse("INS", "Insumos"),
            await Warehouse("SEMI", "Semiterminados"), await Warehouse("PT", "Producto terminado"));
    }

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    [Fact]
    public async Task A_receipt_puts_each_line_in_its_warehouse()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var flour = await factory.CreateItemAsync("HAR");
        var bags = await factory.CreateItemAsync("BOLSA", ItemType.Supply);
        var supplier = await OkAsync<SupplierDto>(admin.PostJsonAsync("/api/v1/suppliers",
            new CreateSupplierRequest($"ABC980312{Random.Shared.Next(100, 999)}", "Proveedor", null, null, null, 0)));
        foreach (var item in new[] { flour, bags })
            await OkAsync<SupplierItemDto>(admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items", new CreateSupplierItemRequest(item.Id, null, 10, 1, true)));

        var order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplier.Id,
            site.Plant.Id, Today.AddDays(3), null, [new PurchaseOrderLineRequest(null, flour.Id, 10, null), new PurchaseOrderLineRequest(null, bags.Id, 50, null)])));
        order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/submit", new VersionRequest(order.Version)));
        order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/approve", new VersionRequest(order.Version)));
        var (flourLine, bagLine) = (order.Lines.Single(l => l.ItemId == flour.Id), order.Lines.Single(l => l.ItemId == bags.Id));

        // Without a warehouse, or with another location's, nothing is received.
        var missing = await admin.PostJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id, order.Version, null, null,
            [new GoodsReceiptLineRequest(flourLine.Id, 10, null, null)]));
        Assert.Contains("warehouse_required", await missing.Content.ReadAsStringAsync());
        var other = await PlantAsync(admin);
        var foreign = await admin.PostJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id, order.Version, null, null,
            [new GoodsReceiptLineRequest(flourLine.Id, 10, null, null)], other.Mp.Id));
        Assert.Contains("warehouse_not_of_location", await foreign.Content.ReadAsStringAsync());

        var receipt = await OkAsync<GoodsReceiptDto>(admin.PostJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id,
            order.Version, "F-1", null, [new GoodsReceiptLineRequest(flourLine.Id, 10, null, null), new GoodsReceiptLineRequest(bagLine.Id, 50, null, null, site.Ins.Id)],
            site.Mp.Id)));
        Assert.Equal([site.Mp.Code, site.Ins.Code], receipt.Lines.OrderBy(l => l.ItemId == bags.Id).Select(l => l.LocationCode));
        Assert.Equal((10m, 50m, 0m), (await factory.StockAsync(site.Mp.Id, flour.Id), await factory.StockAsync(site.Ins.Id, bags.Id),
            await factory.StockAsync(site.Mp.Id, bags.Id)));
    }

    [Fact]
    public async Task A_close_consumes_from_its_warehouses_and_puts_the_product_in_another()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var flour = await factory.CreateItemAsync("HAR");
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null,
            [new RecipeLineRequest(flour.Id, 5, 0), new RecipeLineRequest(dough.Id, 2, 0)])));
        await factory.AddStockAsync(site.Mp.Id, flour.Id, 50, 18m);
        await factory.AddStockAsync(site.Semi.Id, dough.Id, 20, 30m);

        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(site.Plant.Id, bread.Id, 200, Today, null, null, null)));
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));

        var noOutput = await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes", new CreateProductionCloseRequest(order.Version,
            ProductionCloseKind.Partial, 100, null, null, null, null, null, site.Mp.Id));
        Assert.Contains("warehouse_required", await noOutput.Content.ReadAsStringAsync());

        var result = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(order.Version, ProductionCloseKind.Partial, 100, null, null, null, null,
                [new CloseLineRequest(dough.Id, 2, null, site.Semi.Id)], site.Mp.Id, site.Pt.Id)));

        Assert.Equal(site.Pt.Code, result.Close.OutputLocationCode);
        Assert.Equal([(flour.Id, site.Mp.Code), (dough.Id, site.Semi.Code)],
            result.Close.Lines.OrderBy(l => l.ComponentItemId == dough.Id).Select(l => (l.ComponentItemId, l.LocationCode)));
        Assert.Equal((45m, 18m, 100m), (await factory.StockAsync(site.Mp.Id, flour.Id), await factory.StockAsync(site.Semi.Id, dough.Id),
            await factory.StockAsync(site.Pt.Id, bread.Id)));
    }

    [Fact]
    public async Task A_recipe_with_a_factory_consumes_from_it_and_delivers_to_it()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var floor = await LocationAsync(admin, new CreateLocationRequest($"{site.Plant.Code}-FAB", "Fábrica", LocationType.Factory, null, site.Plant.Id));
        Assert.Contains(await admin.GetJsonAsync<List<WarehouseDto>>($"/api/v1/locations/{site.Plant.Id}/warehouses") ?? [],
            w => w.Id == floor.Id && w.Type == LocationType.Factory);
        var flour = await factory.CreateItemAsync("HAR");
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var roll = await factory.CreateItemAsync("TELERA", ItemType.FinishedGood, "pza");
        await factory.AddStockAsync(site.Mp.Id, flour.Id, 50, 18m);
        await factory.AddStockAsync(floor.Id, flour.Id, 10, 18m);

        // RN-49: at a plant with a factory, a recipe without one cannot be produced.
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(roll.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)])));
        var withoutFactory = await admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(site.Plant.Id, roll.Id, 100, Today, null, null, null));
        Assert.Contains("recipe_factory_required", await withoutFactory.Content.ReadAsStringAsync());

        var recipe = await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(bread.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)], floor.Id)));
        Assert.Equal(floor.Code, recipe.FactoryCode);
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(site.Plant.Id, bread.Id, 200, Today, null, null, null, [new ComponentSourceRequest(flour.Id, site.Mp.Id)])));
        // A draft shows what is free at the origin of each line (RN-110).
        Assert.Equal((floor.Id, 50m), (order.FactoryId!.Value, order.Lines.Single().Available!.Value));
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));

        // Neither another source nor another destination.
        var fromRaw = await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes", new CreateProductionCloseRequest(order.Version,
            ProductionCloseKind.Partial, 100, null, null, null, null, null, site.Mp.Id, floor.Id));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, fromRaw.StatusCode);
        Assert.Contains("close_factory_fixed", await fromRaw.Content.ReadAsStringAsync());
        var toFinished = await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes", new CreateProductionCloseRequest(order.Version,
            ProductionCloseKind.Partial, 100, null, null, null, null, null, null, site.Pt.Id));
        Assert.Contains("close_factory_fixed", await toFinished.Content.ReadAsStringAsync());

        // Without choosing anything, the close uses the recipe's factory.
        var result = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(order.Version, ProductionCloseKind.Partial, 100, null, null, null, null, null)));
        Assert.Equal(floor.Code, result.Close.OutputLocationCode);
        Assert.Equal((50m, 5m, 100m), (await factory.StockAsync(site.Mp.Id, flour.Id), await factory.StockAsync(floor.Id, flour.Id),
            await factory.StockAsync(floor.Id, bread.Id)));

        // Changing only the factory of a used recipe keeps its version (it is where, not what).
        var second = await LocationAsync(admin, new CreateLocationRequest($"{site.Plant.Code}-FB2", "Fábrica 2", LocationType.Factory, null, site.Plant.Id));
        recipe = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}"))!;
        var moved = await OkAsync<RecipeDto>(admin.PutJsonAsync($"/api/v1/recipes/{recipe.Id}",
            new UpdateRecipeRequest(recipe.Version, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)], second.Id)));
        Assert.Equal((recipe.Id, 1, second.Code), (moved.Id, moved.RecipeVersion, moved.FactoryCode));

        // The product leaves the factory with an internal voucher.
        var voucher = await admin.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(floor.Id, site.Pt.Id, null, [new TransferLineRequest(bread.Id, null, 100)]));
        Assert.Equal(HttpStatusCode.Created, voucher.StatusCode);
    }

    [Fact]
    public async Task Releasing_an_order_reserves_its_ingredients_and_asks_for_them_with_vouchers()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var floor = await LocationAsync(admin, new CreateLocationRequest($"{site.Plant.Code}-FAB", "Fábrica", LocationType.Factory, null, site.Plant.Id));
        // RN-111: Materias primas supplies raw materials by default; Semiterminados, the dough.
        await OkAsync<LocationDto>(admin.PutJsonAsync($"/api/v1/locations/{site.Mp.Id}",
            new UpdateLocationRequest(site.Mp.Version, site.Mp.Name, null, true, [ItemType.RawMaterial])));
        var taken = await admin.PutJsonAsync($"/api/v1/locations/{site.Ins.Id}",
            new UpdateLocationRequest(site.Ins.Version, site.Ins.Name, null, true, [ItemType.RawMaterial]));
        Assert.Contains("supplies_taken", await taken.Content.ReadAsStringAsync());

        var flour = await factory.CreateItemAsync("HAR");
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var recipe = await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null,
            [new RecipeLineRequest(flour.Id, 5, 0), new RecipeLineRequest(dough.Id, 2, 0)], floor.Id)));
        await factory.AddStockAsync(site.Mp.Id, flour.Id, 50, 18m);
        await factory.AddStockAsync(site.Semi.Id, dough.Id, 10, 30m);

        // Flour by default from Materias primas; the dough chosen by line.
        var sources = (await admin.GetJsonAsync<List<ComponentSourceOptionDto>>(
            $"/api/v1/production-orders/component-sources?locationId={site.Plant.Id}&recipeId={recipe.Id}"))!;
        Assert.Contains(sources, s => s.ComponentItemId == flour.Id && s.LocationId == site.Mp.Id && s.IsDefault && s.Free == 50);
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(site.Plant.Id, bread.Id, 200, Today, null, null, null,
                [new ComponentSourceRequest(dough.Id, site.Semi.Id)])));
        Assert.Equal([(flour.Id, site.Mp.Code), (dough.Id, site.Semi.Code)],
            order.Lines.OrderBy(l => l.ComponentItemId == dough.Id).Select(l => (l.ComponentItemId, l.SourceLocationCode!)));

        // RN-110/RN-112: releasing reserves 10 kg of flour and 4 of dough and creates one voucher per origin to the factory.
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));
        Assert.Equal(2, order.Vouchers!.Count);
        Assert.All(order.Vouchers, v => Assert.Equal((TransferStatus.Draft, floor.Code), (v.Status, v.ToLocationCode)));
        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={site.Plant.Id}&rowLocationId={site.Mp.Id}&itemId={flour.Id}"))!;
        Assert.Equal((50m, 10m), (stock.Items.Single().OnHand, stock.Items.Single().Reserved));

        // Nothing else may take the reserved flour: a manual voucher of 45 kg is refused when sent…
        var manual = await OkAsync<TransferDto>(admin.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(site.Mp.Id, site.Pt.Id, null, [new TransferLineRequest(flour.Id, null, 45)])));
        var refused = await admin.PostJsonAsync($"/api/v1/internal-transfers/{manual.Id}/dispatch", new DispatchInternalTransferRequest(manual.Version, null));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, refused.StatusCode);
        Assert.Contains("stock_reserved", await refused.Content.ReadAsStringAsync());
        // …and another order asking for 45 kg cannot be released.
        var second = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(site.Plant.Id, bread.Id, 900, Today, null, null, null, [new ComponentSourceRequest(dough.Id, site.Semi.Id)])));
        var short_ = await admin.PostJsonAsync($"/api/v1/production-orders/{second.Id}/release", new VersionRequest(second.Version));
        Assert.Contains("release_insufficient_stock", await short_.Content.ReadAsStringAsync());

        // The ingredients voucher cannot be edited; sending it frees the reservation, receiving it stocks the factory.
        var flourVoucher = (await admin.GetJsonAsync<TransferDto>($"/api/v1/internal-transfers/{order.Vouchers.Single(v => v.FromLocationCode == site.Mp.Code).Id}"))!;
        Assert.Equal(order.Folio, flourVoucher.ProductionOrderFolio);
        var edit = await admin.PutJsonAsync($"/api/v1/internal-transfers/{flourVoucher.Id}",
            new UpdateTransferRequest(flourVoucher.Version, floor.Id, null, [new TransferLineRequest(flour.Id, null, 5)]));
        Assert.Contains("transfer_from_production_order", await edit.Content.ReadAsStringAsync());
        flourVoucher = await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/internal-transfers/{flourVoucher.Id}/dispatch",
            new DispatchInternalTransferRequest(flourVoucher.Version, null)));
        await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/internal-transfers/{flourVoucher.Id}/receive", new ReceiveTransferRequest(flourVoucher.Version,
            [new ReceiveLineRequest(flourVoucher.Lines.Single().Id, 10, null, null)])));
        Assert.Equal((40m, 10m), (await factory.StockAsync(site.Mp.Id, flour.Id), await factory.StockAsync(floor.Id, flour.Id)));

        // Cancelling the order cancels the dough voucher still in draft and frees its reservation.
        order = (await admin.GetJsonAsync<ProductionOrderDto>($"/api/v1/production-orders/{order.Id}"))!;
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/cancel", new VersionRequest(order.Version)));
        Assert.Equal(TransferStatus.Cancelled, order.Vouchers!.Single(v => v.FromLocationCode == site.Semi.Code).Status);
        stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={site.Plant.Id}&rowLocationId={site.Semi.Id}&itemId={dough.Id}"))!;
        Assert.Equal(0m, stock.Items.Single().Reserved);
    }

    [Fact]
    public async Task A_transfer_leaves_a_plant_warehouse_and_enters_a_branch_warehouse()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var branch = await LocationAsync(admin, new CreateLocationRequest(Code("S"), "Sucursal", LocationType.Branch, null));
        var showcase = await LocationAsync(admin, new CreateLocationRequest(branch.Code + "-V", "Vitrina", LocationType.Warehouse, null, branch.Id));
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await factory.AddStockAsync(site.Pt.Id, bread.Id, 80, 2m);

        var transfer = await OkAsync<TransferDto>(admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(site.Plant.Id, branch.Id, null, [new TransferLineRequest(bread.Id, null, 30)])));
        var withoutWarehouse = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null));
        Assert.Contains("warehouse_required", await withoutWarehouse.Content.ReadAsStringAsync());

        transfer = await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null, site.Pt.Id)));
        Assert.Equal(site.Pt.Code, transfer.Lines.Single().FromStockLocationCode);
        Assert.Equal(50m, await factory.StockAsync(site.Pt.Id, bread.Id));

        var line = transfer.Lines.Single();
        transfer = await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive",
            new ReceiveTransferRequest(transfer.Version, [new ReceiveLineRequest(line.Id, 30, null, null)], showcase.Id)));
        Assert.Equal(showcase.Code, transfer.Lines.Single().ToStockLocationCode);
        Assert.Equal(30m, await factory.StockAsync(showcase.Id, bread.Id));
    }

    [Fact]
    public async Task A_shipment_leaves_the_chosen_warehouse()
    {
        var admin = await factory.LoginAsAdminAsync();
        var site = await PlantAsync(admin);
        var packaged = await factory.CreateItemAsync("CONCHA-EMB", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);
        await factory.AddStockAsync(site.Pt.Id, packaged.Id, 40, 5m);
        var customer = await OkAsync<CustomerDto>(admin.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest(Code("CLI-"), "Cafeterías", null, null, null, null, null)));

        // Customer orders are supplied by the main plant; this one is placed on the test plant directly.
        Guid orderId;
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var order = new CustomerOrder($"PC-T{Guid.NewGuid():N}"[..14], customer.Id, site.Plant.Id,
                new CustomerOrderPlan(null, Today.AddDays(1), null, null, [new CustomerOrderLineInput(packaged.Id, 12, null)]), Today);
            order.Confirm(Today, DateTimeOffset.UtcNow, null);
            db.CustomerOrders.Add(order);
            await db.SaveChangesAsync();
            orderId = order.Id;
        }

        var shipment = await OkAsync<CustomerShipmentDto>(admin.PostAsync($"/api/v1/customer-orders/{orderId}/shipments", null));
        var withoutWarehouse = await admin.PostJsonAsync($"/api/v1/customer-shipments/{shipment.Id}/dispatch",
            new DispatchCustomerShipmentRequest(shipment.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null, null));
        Assert.Contains("warehouse_required", await withoutWarehouse.Content.ReadAsStringAsync());

        shipment = await OkAsync<CustomerShipmentDto>(admin.PostJsonAsync($"/api/v1/customer-shipments/{shipment.Id}/dispatch",
            new DispatchCustomerShipmentRequest(shipment.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null, null, site.Pt.Id)));
        Assert.Equal(site.Pt.Code, shipment.Lines.Single().LocationCode);
        Assert.Equal(28m, await factory.StockAsync(site.Pt.Id, packaged.Id));
    }
}
