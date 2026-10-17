using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Purchasing;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class RequisitionTests(ApiFactory factory)
{
    private const string Letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private static DateOnly InAWeek => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7);

    private static string NewTaxId() =>
        string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)])) + "980312"
        + string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)]));

    private static async Task<SupplierDto> SupplierAsync(HttpClient admin, string name)
    {
        var response = await admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest(NewTaxId(), name, null, null, null, 30));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<SupplierDto>())!;
    }

    private static async Task SellsAsync(HttpClient admin, SupplierDto supplier, Guid itemId, decimal price, bool preferred)
    {
        var response = await admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items",
            new CreateSupplierItemRequest(itemId, null, price, 2, preferred));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private async Task<RequisitionDto> CreateAsync(HttpClient client, params RequisitionLineRequest[] lines)
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var response = await client.PostJsonAsync("/api/v1/requisitions", new CreateRequisitionRequest(plant, InAWeek, null, lines));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<RequisitionDto>())!;
    }

    private static async Task<RequisitionDto> ActAsync(HttpClient client, RequisitionDto requisition, string action, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await client.PostJsonAsync($"/api/v1/requisitions/{requisition.Id}/{action}", new VersionRequest(requisition.Version));
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.OK ? (await response.Content.ReadJsonAsync<RequisitionDto>())! : requisition;
    }

    private static async Task<RequisitionDto> ApprovedAsync(HttpClient admin, RequisitionDto requisition) =>
        await ActAsync(admin, await ActAsync(admin, requisition, "submit"), "approve");

    private async Task<List<PurchaseOrder>> OrdersOfAsync(params RequisitionDto[] requisitions)
    {
        var lineIds = requisitions.SelectMany(r => r.Lines).Select(l => (Guid?)l.Id).ToList();
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().PurchaseOrders.AsNoTracking().Include(o => o.Lines)
            .Where(o => o.Lines.Any(l => lineIds.Contains(l.RequisitionLineId))).ToListAsync();
    }

    [Fact]
    public async Task Approved_requisitions_convert_into_orders_grouped_by_supplier_and_delivery()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (flour, sugar, yeast) = (await factory.CreateItemAsync("HAR"), await factory.CreateItemAsync("AZU"), await factory.CreateItemAsync("LEV"));
        var mill = await SupplierAsync(admin, "Molino");
        var labs = await SupplierAsync(admin, "Levaduras");
        await SellsAsync(admin, mill, flour.Id, 612.5m, preferred: true);
        await SellsAsync(admin, mill, sugar.Id, 33.333m, preferred: false);
        await SellsAsync(admin, labs, yeast.Id, 90m, preferred: true);

        // Lines without supplier take the preferred one.
        var first = await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 10, null), new RequisitionLineRequest(yeast.Id, 3, null));
        Assert.Equal([mill.Id, labs.Id], first.Lines.Select(l => l.SuggestedSupplierId!.Value));
        Assert.Equal(6395m, first.EstimatedSubtotal);
        var second = await CreateAsync(admin, new RequisitionLineRequest(sugar.Id, 2.5m, mill.Id));
        first = await ApprovedAsync(admin, first);
        second = await ApprovedAsync(admin, second);

        var response = await admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([first.Id, second.Id]));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadJsonAsync<ConvertRequisitionsResult>())!;

        Assert.Equal(2, result.PurchaseOrders.Count);
        var millOrder = result.PurchaseOrders.Single(o => o.SupplierId == mill.Id);
        Assert.Equal(new[] { first.Folio, second.Folio }.Order(), millOrder.RequisitionFolios);
        Assert.Equal((2, 6208.33m, InAWeek), (millOrder.LineCount, millOrder.Subtotal, millOrder.ExpectedDate)); // 6125 + 83.33
        Assert.Equal(270m, result.PurchaseOrders.Single(o => o.SupplierId == labs.Id).Total);

        var orders = await OrdersOfAsync(first, second);
        Assert.All(orders, o => Assert.Equal(PurchaseOrderStatus.Draft, o.Status));
        Assert.Equal(3, orders.Sum(o => o.Lines.Count));

        var converted = await admin.GetJsonAsync<RequisitionDto>($"/api/v1/requisitions/{first.Id}");
        Assert.Equal(RequisitionStatus.Converted, converted!.Status);
        Assert.Equal(millOrder.Folio, converted.Lines.Single(l => l.ItemId == flour.Id).PurchaseOrderFolio);

        // Converted is final: converting again fails.
        var again = await admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([first.Id]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, again.StatusCode);
    }

    [Fact]
    public async Task Conversion_is_all_or_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var mill = await SupplierAsync(admin, "Molino");
        await SellsAsync(admin, mill, flour.Id, 600m, preferred: true);

        var approved = await ApprovedAsync(admin, await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 5, null)));
        var draft = await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 1, null));

        var mixed = await admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([approved.Id, draft.Id]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, mixed.StatusCode);
        Assert.Contains(draft.Folio, await mixed.Content.ReadAsStringAsync());

        // The supplier stopped selling the item after approval.
        var rows = await admin.GetJsonAsync<IReadOnlyList<SupplierItemDto>>($"/api/v1/suppliers/{mill.Id}/items");
        var row = rows!.Single();
        var deactivated = await admin.PutJsonAsync($"/api/v1/suppliers/{mill.Id}/items/{row.Id}",
            new UpdateSupplierItemRequest(row.Version, null, row.Price, 2, IsPreferred: false, IsActive: false));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        var stale = await admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([approved.Id]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, stale.StatusCode);

        Assert.Empty(await OrdersOfAsync(approved, draft));
        Assert.Equal(RequisitionStatus.Approved, (await admin.GetJsonAsync<RequisitionDto>($"/api/v1/requisitions/{approved.Id}"))!.Status);
    }

    [Fact]
    public async Task Concurrent_conversions_of_the_same_requisition_create_one_order()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var mill = await SupplierAsync(admin, "Molino");
        await SellsAsync(admin, mill, flour.Id, 600m, preferred: true);
        var approved = await ApprovedAsync(admin, await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 5, null)));

        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ =>
            admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([approved.Id]))));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, r => r.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.UnprocessableEntity);
        Assert.Single(await OrdersOfAsync(approved));
    }

    [Fact]
    public async Task Lines_follow_the_supplier_catalog_and_submit_needs_every_supplier()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var bread = await factory.CreateItemAsync("CONCHA", Domain.Catalog.ItemType.FinishedGood, "pza");
        var mill = await SupplierAsync(admin, "Molino");
        var plant = await factory.LocationIdAsync("PLANTA");

        var notSold = await admin.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(plant, InAWeek, null, [new RequisitionLineRequest(flour.Id, 1, mill.Id)]));
        Assert.Equal(HttpStatusCode.BadRequest, notSold.StatusCode);

        var finished = await admin.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(plant, InAWeek, null, [new RequisitionLineRequest(bread.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.BadRequest, finished.StatusCode);

        var past = await admin.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(plant, InAWeek.AddDays(-30), null, [new RequisitionLineRequest(flour.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, past.StatusCode);

        var branch = await admin.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(await factory.LocationIdAsync("SUC-01"), InAWeek, null, [new RequisitionLineRequest(flour.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, branch.StatusCode);

        // No preferred supplier: the draft is saved without one and cannot be sent.
        var draft = await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 1, null));
        Assert.Null(draft.Lines.Single().SuggestedSupplierId);
        await ActAsync(admin, draft, "submit", HttpStatusCode.UnprocessableEntity);

        await SellsAsync(admin, mill, flour.Id, 600m, preferred: false);
        var updated = await admin.PutJsonAsync($"/api/v1/requisitions/{draft.Id}",
            new UpdateRequisitionRequest(draft.Version, InAWeek, "Con proveedor", [new RequisitionLineRequest(flour.Id, 2, mill.Id)]));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var submitted = await ActAsync(admin, (await updated.Content.ReadJsonAsync<RequisitionDto>())!, "submit");

        var reject = await admin.PostJsonAsync($"/api/v1/requisitions/{submitted.Id}/reject", new RejectRequisitionRequest(submitted.Version, "Hay existencia"));
        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);
        var rejected = (await reject.Content.ReadJsonAsync<RequisitionDto>())!;
        Assert.Equal((RequisitionStatus.Rejected, "Hay existencia"), (rejected.Status, rejected.RejectionReason));
        await ActAsync(admin, rejected, "cancel", HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Purchasing_creates_and_submits_but_approving_needs_its_permission()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var mill = await SupplierAsync(admin, "Molino");
        await SellsAsync(admin, mill, flour.Id, 600m, preferred: true);

        var email = ApiFactory.UniqueEmail("compras");
        await factory.CreateUserAsync(email, ["purchasing"], ["PLANTA"]);
        var buyer = await factory.LoginAsync(email);
        var warehouseEmail = ApiFactory.UniqueEmail("almacen");
        await factory.CreateUserAsync(warehouseEmail, ["plant_warehouse"], ["PLANTA"]);
        var warehouse = await factory.LoginAsync(warehouseEmail);

        var requisition = await CreateAsync(buyer, new RequisitionLineRequest(flour.Id, 3, null));
        requisition = await ActAsync(buyer, requisition, "submit");
        await ActAsync(buyer, requisition, "approve", HttpStatusCode.Forbidden);

        var plant = await factory.LocationIdAsync("PLANTA");
        var create = await warehouse.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(plant, InAWeek, null, [new RequisitionLineRequest(flour.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        var list = await warehouse.GetJsonAsync<PagedResult<RequisitionListItemDto>>($"/api/v1/requisitions?q={requisition.Folio}");
        Assert.Equal([requisition.Id], list!.Items.Select(r => r.Id));

        requisition = await ActAsync(admin, requisition, "approve");
        var convert = await buyer.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([requisition.Id]));
        Assert.Equal(HttpStatusCode.OK, convert.StatusCode);
    }

    [Fact]
    public async Task An_item_may_repeat_with_a_note_and_each_line_becomes_its_own_order_line()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var mill = await SupplierAsync(admin, "Molino");
        var other = await SupplierAsync(admin, "Harinera");
        await SellsAsync(admin, mill, flour.Id, 600m, preferred: true);
        await SellsAsync(admin, other, flour.Id, 590m, preferred: false);
        var plant = await factory.LocationIdAsync("PLANTA");

        var withoutNote = await admin.PostJsonAsync("/api/v1/requisitions", new CreateRequisitionRequest(plant, InAWeek, null,
            [new RequisitionLineRequest(flour.Id, 10, null), new RequisitionLineRequest(flour.Id, 5, other.Id)]));
        Assert.Equal(HttpStatusCode.BadRequest, withoutNote.StatusCode);

        var requisition = await CreateAsync(admin, new RequisitionLineRequest(flour.Id, 10, null),
            new RequisitionLineRequest(flour.Id, 5, other.Id, "Segundo proveedor por volumen"));
        Assert.Equal([null, "Segundo proveedor por volumen"], requisition.Lines.Select(l => l.Notes));

        requisition = await ApprovedAsync(admin, requisition);
        var result = (await (await admin.PostJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest([requisition.Id])))
            .Content.ReadJsonAsync<ConvertRequisitionsResult>())!;
        Assert.Equal([mill.Id, other.Id], result.PurchaseOrders.Select(o => o.SupplierId).OrderBy(id => id == other.Id));
    }
}
