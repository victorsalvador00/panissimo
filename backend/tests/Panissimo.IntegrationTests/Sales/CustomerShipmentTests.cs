using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Sales;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Sales;

[Collection(ApiCollection.Name)]
public class CustomerShipmentTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private async Task<(Guid Plant, Item Item, CustomerOrderDto Order)> ConfirmedOrderAsync(HttpClient admin, decimal quantity, bool tracksLots = false)
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("CONCHA-EMB", ItemType.FinishedGood, "pza", tracksLots: tracksLots, shelfLifeDays: tracksLots ? 5 : null,
            presentation: ItemPresentation.Packaged);
        var customer = (await (await admin.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest($"CLI-{Guid.NewGuid():N}"[..12], "Cafeterías", null, null, null, null, null))).Content.ReadJsonAsync<CustomerDto>())!;
        var order = (await (await admin.PostJsonAsync("/api/v1/customer-orders", new CreateCustomerOrderRequest(customer.Id, null, Today.AddDays(2),
            "OC-1", null, [new CustomerOrderLineRequest(item.Id, quantity, 40m)]))).Content.ReadJsonAsync<CustomerOrderDto>())!;
        order = (await (await admin.PostJsonAsync($"/api/v1/customer-orders/{order.Id}/confirm", new VersionRequest(order.Version)))
            .Content.ReadJsonAsync<CustomerOrderDto>())!;
        Assert.Equal(CustomerOrderStatus.Confirmed, order.Status);
        return (plant, item, order);
    }

    private static async Task<CustomerShipmentDto> NewShipmentAsync(HttpClient client, CustomerOrderDto order)
    {
        var response = await client.PostAsync($"/api/v1/customer-orders/{order.Id}/shipments", null);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<CustomerShipmentDto>())!;
    }

    private static Task<HttpResponseMessage> DispatchAsync(HttpClient client, CustomerShipmentDto shipment,
        IReadOnlyList<CustomerShipmentDispatchLineRequest>? lines = null) =>
        client.PostJsonAsync($"/api/v1/customer-shipments/{shipment.Id}/dispatch",
            new DispatchCustomerShipmentRequest(shipment.Version, "Camioneta 3", "Luis", "Marta", lines));

    private static async Task<CustomerShipmentDto> DispatchedAsync(HttpClient client, CustomerShipmentDto shipment,
        IReadOnlyList<CustomerShipmentDispatchLineRequest>? lines = null)
    {
        var response = await DispatchAsync(client, shipment, lines);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadJsonAsync<CustomerShipmentDto>())!;
    }

    private static async Task<CustomerShipmentDto> SetQuantityAsync(HttpClient client, CustomerShipmentDto shipment, decimal quantity,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await client.PutJsonAsync($"/api/v1/customer-shipments/{shipment.Id}",
            new UpdateCustomerShipmentRequest(shipment.Version, null, [new CustomerShipmentLineQuantityRequest(shipment.Lines[0].Id, quantity)]));
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.OK ? (await response.Content.ReadJsonAsync<CustomerShipmentDto>())! : shipment;
    }

    private static async Task<CustomerOrderDto> OrderAsync(HttpClient client, CustomerOrderDto order) =>
        (await client.GetJsonAsync<CustomerOrderDto>($"/api/v1/customer-orders/{order.Id}"))!;

    private async Task<Guid> LotIdAsync(Guid itemId, string number)
    {
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Lots
            .Where(l => l.ItemId == itemId && l.LotNumber == number).Select(l => l.Id).SingleAsync();
    }

    private async Task<decimal> LotStockAsync(Guid locationId, Guid itemId, string number)
    {
        var lotId = await LotIdAsync(itemId, number);
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().StockBalances
            .Where(b => b.LocationId == locationId && b.ItemId == itemId && b.LotId == lotId).SumAsync(b => b.Quantity);
    }

    [Fact]
    public async Task Order_partial_then_final_shipment_by_fefo_skipping_expired_lots()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 120, tracksLots: true);
        await factory.AddStockAsync(plant, item.Id, 50, 10m, "L-A", Today.AddDays(3));
        await factory.AddStockAsync(plant, item.Id, 100, 10m, "L-B", Today.AddDays(5));
        await factory.AddStockAsync(plant, item.Id, 20, 10m, "L-X", Today.AddDays(-1)); // expired

        // First shipment: prefilled with the whole balance, reduced to 70; FEFO takes L-A then L-B.
        var first = await NewShipmentAsync(admin, order);
        Assert.Equal((CustomerShipmentStatus.Draft, 120m, 120m), (first.Status, first.Lines[0].Quantity, first.Lines[0].MaxQuantity));
        first = await SetQuantityAsync(admin, first, 70);
        first = await DispatchedAsync(admin, first);
        Assert.Equal(CustomerShipmentStatus.Dispatched, first.Status);
        Assert.Equal([("L-A", 50m), ("L-B", 20m)], first.Lines[0].Lots.Select(l => (l.LotNumber, l.Quantity)));
        Assert.Equal((10m, 700m, "Marta"), (first.Lines[0].UnitCost!.Value, first.TotalCost!.Value, first.ReceivedByName));

        order = await OrderAsync(admin, order);
        Assert.Equal((CustomerOrderStatus.PartiallyShipped, 70m, 50m), (order.Status, order.Lines[0].ShippedQty, order.Lines[0].PendingQty));

        // A dispatched shipment is not edited or cancelled.
        await SetQuantityAsync(admin, first, 1, HttpStatusCode.UnprocessableEntity);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await admin.PostJsonAsync($"/api/v1/customer-shipments/{first.Id}/cancel", new VersionRequest(first.Version))).StatusCode);

        // Second shipment: the expired lot is rejected; FEFO completes the order.
        var second = await NewShipmentAsync(admin, order);
        Assert.Equal(50m, second.Lines[0].Quantity);
        var expired = await DispatchAsync(admin, second,
            [new CustomerShipmentDispatchLineRequest(second.Lines[0].Id, [new LotQuantity(await LotIdAsync(item.Id, "L-X"), 50)])]);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, expired.StatusCode);
        await DispatchedAsync(admin, (await admin.GetJsonAsync<CustomerShipmentDto>($"/api/v1/customer-shipments/{second.Id}"))!);

        order = await OrderAsync(admin, order);
        Assert.Equal((CustomerOrderStatus.Shipped, 120m), (order.Status, order.Lines[0].ShippedQty));
        Assert.Equal(2, order.Shipments.Count);
        Assert.Equal((0m, 30m, 20m), (await LotStockAsync(plant, item.Id, "L-A"), await LotStockAsync(plant, item.Id, "L-B"),
            await LotStockAsync(plant, item.Id, "L-X")));

        await using var scope = factory.CreateScope();
        var movements = await scope.ServiceProvider.GetRequiredService<AppDbContext>().InventoryMovements
            .Where(m => m.ItemId == item.Id && m.Type == MovementType.CustomerShipment).ToListAsync();
        Assert.Equal(-120m, movements.Sum(m => m.Quantity));
        Assert.All(movements, m => Assert.Equal(10m, m.UnitCost));

        var nothingLeft = await admin.PostAsync($"/api/v1/customer-orders/{order.Id}/shipments", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, nothingLeft.StatusCode);
    }

    [Fact]
    public async Task Shipping_over_the_order_is_allowed_only_up_to_the_tolerance()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 10);
        await factory.AddStockAsync(plant, item.Id, 50, 10m);
        var shipment = await NewShipmentAsync(admin, order);
        await SetQuantityAsync(admin, shipment, 11, HttpStatusCode.UnprocessableEntity); // default tolerance 0 %

        var previous = await factory.SetSettingAsync(AppSettingKeys.ShipmentTolerancePct, 10);
        try
        {
            await SetQuantityAsync(admin, shipment, 12, HttpStatusCode.UnprocessableEntity);
            shipment = await SetQuantityAsync(admin, shipment, 11);
            await DispatchedAsync(admin, shipment);
        }
        finally
        {
            await factory.SetSettingAsync(AppSettingKeys.ShipmentTolerancePct, previous);
        }

        order = await OrderAsync(admin, order);
        Assert.Equal((CustomerOrderStatus.Shipped, 11m, 0m), (order.Status, order.Lines[0].ShippedQty, order.Lines[0].PendingQty));
        Assert.Equal(39m, await factory.StockAsync(plant, item.Id));
    }

    [Fact]
    public async Task A_partially_shipped_order_closes_with_its_balance()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 10);
        await factory.AddStockAsync(plant, item.Id, 50, 10m);
        await DispatchedAsync(admin, await SetQuantityAsync(admin, await NewShipmentAsync(admin, order), 4));
        order = await OrderAsync(admin, order);

        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await admin.PostJsonAsync($"/api/v1/customer-orders/{order.Id}/cancel", new VersionRequest(order.Version))).StatusCode);
        var closed = await admin.PostJsonAsync($"/api/v1/customer-orders/{order.Id}/close", new CloseCustomerOrderRequest(order.Version, "Ya no lo requiere"));
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);
        order = (await closed.Content.ReadJsonAsync<CustomerOrderDto>())!;
        Assert.Equal((CustomerOrderStatus.Closed, "Ya no lo requiere"), (order.Status, order.CloseReason));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsync($"/api/v1/customer-orders/{order.Id}/shipments", null)).StatusCode);
    }

    [Fact]
    public async Task Concurrent_dispatches_of_one_order_ship_once()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 10);
        await factory.AddStockAsync(plant, item.Id, 50, 10m);
        var a = await NewShipmentAsync(admin, order);
        var b = await NewShipmentAsync(admin, order);

        var responses = await Task.WhenAll(DispatchAsync(admin, a), DispatchAsync(admin, b));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.UnprocessableEntity);
        Assert.Equal(40m, await factory.StockAsync(plant, item.Id));
        Assert.Equal(10m, (await OrderAsync(admin, order)).Lines[0].ShippedQty);
    }

    [Fact]
    public async Task Without_stock_the_dispatch_fails_completely_and_the_draft_can_be_cancelled()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 10);
        await factory.AddStockAsync(plant, item.Id, 4, 10m);
        var shipment = await NewShipmentAsync(admin, order);

        var response = await DispatchAsync(admin, shipment);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("insufficient_stock", await response.Content.ReadAsStringAsync());
        Assert.Equal(4m, await factory.StockAsync(plant, item.Id));
        Assert.Equal(CustomerOrderStatus.Confirmed, (await OrderAsync(admin, order)).Status);

        var cancelled = await admin.PostJsonAsync($"/api/v1/customer-shipments/{shipment.Id}/cancel", new VersionRequest(shipment.Version));
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal(CustomerShipmentStatus.Cancelled, (await cancelled.Content.ReadJsonAsync<CustomerShipmentDto>())!.Status);
    }

    [Fact]
    public async Task The_warehouse_dispatches_and_sales_does_not()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, item, order) = await ConfirmedOrderAsync(admin, 3);
        await factory.AddStockAsync(plant, item.Id, 10, 10m);

        async Task<HttpClient> UserAsync(string role)
        {
            var email = ApiFactory.UniqueEmail(role);
            await factory.CreateUserAsync(email, [role], ["PLANTA"]);
            return await factory.LoginAsync(email);
        }
        var sales = await UserAsync("customer_sales");
        var warehouse = await UserAsync("plant_warehouse");

        Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsync($"/api/v1/customer-orders/{order.Id}/shipments", null)).StatusCode);
        var shipment = await NewShipmentAsync(warehouse, order);
        Assert.Equal(HttpStatusCode.Forbidden, (await DispatchAsync(sales, shipment)).StatusCode);
        await DispatchedAsync(warehouse, shipment);

        var toDispatch = await sales.GetJsonAsync<PagedResult<CustomerShipmentListItemDto>>($"/api/v1/customer-shipments?tab=ToDispatch&customerOrderId={order.Id}");
        Assert.Empty(toDispatch!.Items);
        var all = await sales.GetJsonAsync<PagedResult<CustomerShipmentListItemDto>>($"/api/v1/customer-orders/{order.Id}/shipments");
        Assert.Equal([shipment.Id], all!.Items.Select(s => s.Id));
    }
}
