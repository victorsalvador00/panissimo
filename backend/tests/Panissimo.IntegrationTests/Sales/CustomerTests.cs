using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Sales;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Sales;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Sales;

[Collection(ApiCollection.Name)]
public class CustomerTests(ApiFactory factory)
{
    private const string Letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private static DateOnly InTwoDays => ApiFactory.Today.AddDays(2);

    private static string NewCode() => $"CLI-{Guid.NewGuid():N}"[..12].ToUpperInvariant();

    private static string NewTaxId() =>
        string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)])) + "010522"
        + string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)]));

    private static async Task<CustomerDto> CreateCustomerAsync(HttpClient client, string? taxId = null)
    {
        var response = await client.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest(NewCode().ToLowerInvariant(), "Cafeterías del Bajío", taxId, "Marta", null, "compras@cafe.mx", null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<CustomerDto>())!;
    }

    private static async Task<CustomerOrderDto> CreateOrderAsync(HttpClient client, Guid customerId, Guid? pointId, params CustomerOrderLineRequest[] lines)
    {
        var response = await client.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customerId, pointId, InTwoDays, "OC-7781", null, lines));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<CustomerOrderDto>())!;
    }

    private static async Task<CustomerOrderDto> ActAsync(HttpClient client, CustomerOrderDto order, string action, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await client.PostJsonAsync($"/api/v1/customer-orders/{order.Id}/{action}", new VersionRequest(order.Version));
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.OK ? (await response.Content.ReadJsonAsync<CustomerOrderDto>())! : order;
    }

    private Task<Item> PackagedAsync() => factory.CreateItemAsync("CONCHA-EMB", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);

    [Fact]
    public async Task Customer_code_is_unique_and_the_optional_rfc_follows_the_supplier_rules()
    {
        var admin = await factory.LoginAsAdminAsync();
        var taxId = NewTaxId();
        var customer = await CreateCustomerAsync(admin, taxId.ToLowerInvariant());
        Assert.Equal(taxId, customer.TaxId);
        Assert.Equal(customer.Code.ToUpperInvariant(), customer.Code);

        var sameCode = await admin.PostJsonAsync("/api/v1/customers", new CreateCustomerRequest(customer.Code, "Otro", null, null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, sameCode.StatusCode);
        Assert.Contains("code", await sameCode.Content.ReadAsStringAsync());
        var sameRfc = await admin.PostJsonAsync("/api/v1/customers", new CreateCustomerRequest(NewCode(), "Otro", taxId, null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, sameRfc.StatusCode);
        var badRfc = await admin.PostJsonAsync("/api/v1/customers", new CreateCustomerRequest(NewCode(), "Otro", "XYZ123", null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, badRfc.StatusCode);

        // Without RFC, or with a generic one, many customers coexist.
        await CreateCustomerAsync(admin);
        await CreateCustomerAsync(admin);
        await CreateCustomerAsync(admin, TaxIdRules.GenericNational);
        await CreateCustomerAsync(admin, TaxIdRules.GenericNational);

        var lookup = await admin.GetJsonAsync<IReadOnlyList<CustomerLookupDto>>($"/api/v1/customers/lookup?q={customer.Code}");
        Assert.Equal([customer.Id], lookup!.Select(c => c.Id));

        var deactivated = await admin.PutJsonAsync($"/api/v1/customers/{customer.Id}",
            new UpdateCustomerRequest(customer.Version, customer.Code, customer.Name, null, null, null, null, null, IsActive: false));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        Assert.Empty((await admin.GetJsonAsync<PagedResult<CustomerListItemDto>>($"/api/v1/customers?q={customer.Code}"))!.Items);
    }

    [Fact]
    public async Task Delivery_points_and_items_belong_to_the_customer_and_items_are_finished_goods()
    {
        var admin = await factory.LoginAsAdminAsync();
        var customer = await CreateCustomerAsync(admin);
        var packaged = await PackagedAsync();
        var bulk = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");

        var point = (await (await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/delivery-points",
            new CreateDeliveryPointRequest("Sucursal Centro", "Madero 120"))).Content.ReadJsonAsync<DeliveryPointDto>())!;
        var renamed = await admin.PutJsonAsync($"/api/v1/customers/{customer.Id}/delivery-points/{point.Id}",
            new UpdateDeliveryPointRequest(point.Version, "Centro", "Madero 122", true));
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var other = await CreateCustomerAsync(admin);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutJsonAsync($"/api/v1/customers/{other.Id}/delivery-points/{point.Id}",
            new UpdateDeliveryPointRequest(point.Version, "X", null, true))).StatusCode);

        var bulkItem = await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/items", new CreateCustomerItemRequest(bulk.Id, null, 10));
        Assert.Equal(HttpStatusCode.Created, bulkItem.StatusCode); // D-05
        var supply = await factory.CreateItemAsync("BOLSA", ItemType.Supply);
        var supplyItem = await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/items", new CreateCustomerItemRequest(supply.Id, null, 1));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, supplyItem.StatusCode);
        var row = await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/items", new CreateCustomerItemRequest(packaged.Id, "PAN-6", 42.5m));
        Assert.Equal(HttpStatusCode.Created, row.StatusCode);
        var twice = await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/items", new CreateCustomerItemRequest(packaged.Id, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, twice.StatusCode);

        var items = await admin.GetJsonAsync<IReadOnlyList<CustomerItemDto>>($"/api/v1/customers/{customer.Id}/items");
        Assert.Equal(("PAN-6", 42.5m), (items!.Single(i => i.ItemId == packaged.Id).CustomerSku, items!.Single(i => i.ItemId == packaged.Id).Price!.Value));
    }

    [Fact]
    public async Task Orders_take_finished_goods_only_and_a_confirmed_order_is_not_edited()
    {
        var admin = await factory.LoginAsAdminAsync();
        var customer = await CreateCustomerAsync(admin);
        var packaged = await PackagedAsync();
        var bulk = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await admin.PostJsonAsync($"/api/v1/customers/{customer.Id}/items", new CreateCustomerItemRequest(packaged.Id, "PAN-6", 42.5m));

        var withBulk = await admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, null, InTwoDays, null, null, [new CustomerOrderLineRequest(bulk.Id, 10, null)]));
        Assert.Equal(HttpStatusCode.Created, withBulk.StatusCode); // D-05
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var withDough = await admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, null, InTwoDays, null, null, [new CustomerOrderLineRequest(dough.Id, 10, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, withDough.StatusCode);

        var otherPoint = (await (await admin.PostJsonAsync($"/api/v1/customers/{(await CreateCustomerAsync(admin)).Id}/delivery-points",
            new CreateDeliveryPointRequest("Ajeno", null))).Content.ReadJsonAsync<DeliveryPointDto>())!;
        var foreignPoint = await admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, otherPoint.Id, InTwoDays, null, null, [new CustomerOrderLineRequest(packaged.Id, 10, null)]));
        Assert.Equal(HttpStatusCode.BadRequest, foreignPoint.StatusCode);

        var past = await admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, null, InTwoDays.AddDays(-10), null, null, [new CustomerOrderLineRequest(packaged.Id, 10, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, past.StatusCode);

        // The price comes from the customer's item when omitted.
        var order = await CreateOrderAsync(admin, customer.Id, null, new CustomerOrderLineRequest(packaged.Id, 120, null));
        Assert.Equal((CustomerOrderStatus.Draft, 42.5m, 5100m, "PAN-6"),
            (order.Status, order.Lines.Single().UnitPrice!.Value, order.EstimatedSubtotal, order.Lines.Single().CustomerSku));
        var drafts = await admin.GetJsonAsync<PagedResult<CustomerOrderListItemDto>>($"/api/v1/customer-orders?tab=Drafts&customerId={customer.Id}");
        Assert.Contains(order.Id, drafts!.Items.Select(o => o.Id));
        Assert.All(drafts.Items, o => Assert.Equal(CustomerOrderStatus.Draft, o.Status));

        var edited = await admin.PutJsonAsync($"/api/v1/customer-orders/{order.Id}", new UpdateCustomerOrderRequest(order.Version, null,
            InTwoDays, "OC-7782", "Andén 2", [new CustomerOrderLineRequest(packaged.Id, 150, 40m)]));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        order = (await edited.Content.ReadJsonAsync<CustomerOrderDto>())!;

        order = await ActAsync(admin, order, "confirm");
        Assert.Equal(CustomerOrderStatus.Confirmed, order.Status);
        var toFulfill = await admin.GetJsonAsync<PagedResult<CustomerOrderListItemDto>>($"/api/v1/customer-orders?tab=ToFulfill&customerId={customer.Id}");
        Assert.Equal([order.Id], toFulfill!.Items.Select(o => o.Id));

        var editConfirmed = await admin.PutJsonAsync($"/api/v1/customer-orders/{order.Id}", new UpdateCustomerOrderRequest(order.Version, null,
            InTwoDays, null, null, [new CustomerOrderLineRequest(packaged.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, editConfirmed.StatusCode);
        var close = await admin.PostJsonAsync($"/api/v1/customer-orders/{order.Id}/close", new CloseCustomerOrderRequest(order.Version, "Ya no"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, close.StatusCode); // only with a partial shipment (B-19)

        order = await ActAsync(admin, order, "cancel");
        Assert.Equal(CustomerOrderStatus.Cancelled, order.Status);
        await ActAsync(admin, order, "confirm", HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Inactive_customers_take_no_orders()
    {
        var admin = await factory.LoginAsAdminAsync();
        var customer = await CreateCustomerAsync(admin);
        var packaged = await PackagedAsync();
        var order = await CreateOrderAsync(admin, customer.Id, null, new CustomerOrderLineRequest(packaged.Id, 6, null));
        Assert.Null(order.Lines.Single().UnitPrice);

        await admin.PutJsonAsync($"/api/v1/customers/{customer.Id}",
            new UpdateCustomerRequest(customer.Version, customer.Code, customer.Name, null, null, null, null, null, IsActive: false));
        await ActAsync(admin, order, "confirm", HttpStatusCode.UnprocessableEntity);
        var create = await admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, null, InTwoDays, null, null, [new CustomerOrderLineRequest(packaged.Id, 6, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, create.StatusCode);
    }

    [Fact]
    public async Task Sales_manages_orders_the_warehouse_only_views_and_branches_see_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var customer = await CreateCustomerAsync(admin);
        var packaged = await PackagedAsync();

        async Task<HttpClient> UserAsync(string role, string location)
        {
            var email = ApiFactory.UniqueEmail(role);
            await factory.CreateUserAsync(email, [role], [location]);
            return await factory.LoginAsync(email);
        }

        var sales = await UserAsync("customer_sales", "PLANTA");
        var warehouse = await UserAsync("plant_warehouse", "PLANTA");
        var branch = await UserAsync("branch_manager", "SUC-01");

        var order = await CreateOrderAsync(sales, customer.Id, null, new CustomerOrderLineRequest(packaged.Id, 6, null));
        Assert.Equal(HttpStatusCode.OK, (await warehouse.GetAsync($"/api/v1/customer-orders/{order.Id}")).StatusCode);
        await ActAsync(warehouse, order, "confirm", HttpStatusCode.Forbidden);
        Assert.Equal(HttpStatusCode.Forbidden, (await warehouse.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest(NewCode(), "X", null, null, null, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await branch.GetAsync("/api/v1/customer-orders")).StatusCode);
    }

    [Fact]
    public async Task The_customer_code_can_change_while_it_stays_unique()
    {
        var admin = await factory.LoginAsAdminAsync();
        var customer = await CreateCustomerAsync(admin);
        var other = await CreateCustomerAsync(admin);

        var taken = await admin.PutJsonAsync($"/api/v1/customers/{customer.Id}",
            new UpdateCustomerRequest(customer.Version, other.Code, customer.Name, null, null, null, null, null, true));
        Assert.Equal(HttpStatusCode.BadRequest, taken.StatusCode);
        Assert.Contains("code", await taken.Content.ReadAsStringAsync());

        var newCode = NewCode().ToLowerInvariant();
        var renamed = await admin.PutJsonAsync($"/api/v1/customers/{customer.Id}",
            new UpdateCustomerRequest(customer.Version, newCode, customer.Name, null, null, null, null, null, true));
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.Equal(newCode.ToUpperInvariant(), (await renamed.Content.ReadJsonAsync<CustomerDto>())!.Code);
    }
}
