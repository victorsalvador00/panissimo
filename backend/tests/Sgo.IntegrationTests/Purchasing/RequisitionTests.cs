using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Purchasing;
using Sgo.Domain.Purchasing;
using Sgo.Domain.Security;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class RequisitionTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<T>())!;
    }

    private static RequisitionLineRequest L(Guid itemId, decimal quantity, Guid? supplierId = null) => new(itemId, quantity, supplierId);

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, Guid locationId, DateOnly neededBy, params RequisitionLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/requisitions", new CreateRequisitionRequest(locationId, neededBy, null, lines));

    private static Task<HttpResponseMessage> ActAsync(HttpClient client, RequisitionDto requisition, string action) =>
        client.PostAsJsonAsync($"/api/v1/requisitions/{requisition.Id}/{action}", new VersionRequest(requisition.Version));

    private static async Task<RequisitionDto> ApprovedAsync(HttpClient admin, Guid locationId, DateOnly neededBy, params RequisitionLineRequest[] lines)
    {
        var requisition = await OkAsync<RequisitionDto>(await CreateAsync(admin, locationId, neededBy, lines));
        requisition = await OkAsync<RequisitionDto>(await ActAsync(admin, requisition, "submit"));
        return await OkAsync<RequisitionDto>(await ActAsync(admin, requisition, "approve"));
    }

    private static Task<HttpResponseMessage> ConvertAsync(HttpClient client, params Guid[] ids) =>
        client.PostAsJsonAsync("/api/v1/requisitions/convert", new ConvertRequisitionsRequest(ids));

    /// <summary>An active item bought by "caja" of 25 kg, with VAT <paramref name="taxRate"/>.</summary>
    private static async Task<ItemDto> ItemAsync(HttpClient admin, decimal taxRate = 0m) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TaxRate = taxRate });

    private static async Task<SupplierDto> SupplierWithAsync(HttpClient admin, params (ItemDto Item, decimal Price, bool Preferred)[] offers)
    {
        var supplier = await admin.CreateSupplierAsync();
        foreach (var (item, price, preferred) in offers)
            await OkAsync<SupplierItemDto>(await admin.AddSupplierItemAsync(supplier.Id, item.Id, price, preferred));
        return supplier;
    }

    [Fact]
    public async Task Approved_requisitions_become_purchase_orders_grouped_by_supplier_and_location()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var com = await factory.LocationIdAsync("COM");
        var flour = await ItemAsync(admin);
        var sugar = await ItemAsync(admin);
        var milk = await ItemAsync(admin, 0.16m);
        var harinas = await SupplierWithAsync(admin, (flour, 400m, true), (sugar, 30.5m, true));
        var lacteos = await SupplierWithAsync(admin, (milk, 25m, true));

        // Suppliers come from the preferred ones when not given.
        var r1 = await ApprovedAsync(admin, fab, Today.AddDays(5), L(flour.Id, 8), L(milk.Id, 4));
        var r2 = await ApprovedAsync(admin, fab, Today.AddDays(2), L(flour.Id, 2), L(sugar.Id, 1.5m));
        var r3 = await ApprovedAsync(admin, com, Today.AddDays(3), L(flour.Id, 5, harinas.Id));
        Assert.Equal(harinas.Id, r1.Lines.Single(l => l.ItemId == flour.Id).SuggestedSupplier!.Id);
        Assert.Equal(400m, r1.Lines.Single(l => l.ItemId == flour.Id).EstimatedPrice);

        var orders = await OkAsync<List<PurchaseOrderListItemDto>>(await ConvertAsync(admin, r1.Id, r2.Id, r3.Id));

        Assert.Equal(3, orders.Count);
        Assert.All(orders, o => Assert.Equal(PurchaseOrderStatus.Draft, o.Status));
        var harinasFab = orders.Single(o => o.Supplier.Id == harinas.Id && o.DeliveryLocation.Id == fab);
        var harinasCom = orders.Single(o => o.Supplier.Id == harinas.Id && o.DeliveryLocation.Id == com);
        var lacteosFab = orders.Single(o => o.Supplier.Id == lacteos.Id);
        Assert.Equal(fab, lacteosFab.DeliveryLocation.Id);

        var detail = (await admin.GetJsonAsync<PurchaseOrderDto>($"/api/v1/purchase-orders/{harinasFab.Id}"))!;
        Assert.StartsWith("OC-", detail.Folio);
        Assert.Equal(Today.AddDays(2), detail.ExpectedDate); // earliest NeededBy
        Assert.Contains(r1.Folio, detail.Notes);
        Assert.Contains(r2.Folio, detail.Notes);
        Assert.Equal(3, detail.Lines.Count); // one PO line per requisition line
        Assert.Equal([2m, 8m], detail.Lines.Where(l => l.ItemId == flour.Id).Select(l => l.Quantity).Order());
        Assert.All(detail.Lines, l => Assert.Equal("caja", l.PurchaseUomCode));
        Assert.Equal(4045.75m, detail.Subtotal); // 10 × 400 + 1.5 × 30.5
        Assert.Equal(0m, detail.TaxTotal);
        Assert.Equal(r2.Folio, detail.Lines.Single(l => l.ItemId == sugar.Id).RequisitionFolio);

        var milkOrder = (await admin.GetJsonAsync<PurchaseOrderDto>($"/api/v1/purchase-orders/{lacteosFab.Id}"))!;
        Assert.Equal((100m, 16m, 116m), (milkOrder.Subtotal, milkOrder.TaxTotal, milkOrder.Total));

        // Requisitions are converted and point to their orders.
        var converted = (await admin.GetJsonAsync<RequisitionDto>($"/api/v1/requisitions/{r1.Id}"))!;
        Assert.Equal(RequisitionStatus.Converted, converted.Status);
        Assert.Equal(new[] { harinasFab.Folio, lacteosFab.Folio }.Order(), converted.PurchaseOrders.Select(o => o.Folio));

        // Converting again is refused; nothing else is created.
        var again = await ConvertAsync(admin, r3.Id);
        Assert.Equal("requisition_not_approved", await again.ProblemCodeAsync());
        var byHarinas = (await admin.GetJsonAsync<PagedResult<PurchaseOrderListItemDto>>($"/api/v1/purchase-orders?supplierId={harinas.Id}"))!;
        Assert.Equal(2, byHarinas.Total);

        // State changes are audited (RN-41).
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        Assert.True(await db.AuditLogs.CountAsync(a => a.EntityId == r1.Id.ToString()) >= 4);
        Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityId == harinasFab.Id.ToString()));
    }

    [Fact]
    public async Task Conversion_is_all_or_nothing()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var flour = await ItemAsync(admin);
        var milk = await ItemAsync(admin);
        var harinas = await SupplierWithAsync(admin, (flour, 400m, true));
        var lacteos = await SupplierWithAsync(admin, (milk, 25m, true));
        var approved = await ApprovedAsync(admin, fab, Today.AddDays(1), L(flour.Id, 1));
        var draft = await OkAsync<RequisitionDto>(await CreateAsync(admin, fab, Today.AddDays(1), L(flour.Id, 1)));

        Assert.Equal("requisition_not_approved", await (await ConvertAsync(admin, approved.Id, draft.Id)).ProblemCodeAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await ConvertAsync(admin, approved.Id, Guid.NewGuid())).StatusCode);

        // A supplier deactivated after approval blocks the conversion.
        var withMilk = await ApprovedAsync(admin, fab, Today.AddDays(1), L(milk.Id, 1));
        var current = (await admin.GetJsonAsync<SupplierDto>($"/api/v1/suppliers/{lacteos.Id}"))!;
        await OkAsync<SupplierDto>(await admin.PutAsJsonAsync($"/api/v1/suppliers/{lacteos.Id}", new UpdateSupplierRequest(current.Version,
            current.TaxId, current.Name, current.ContactName, current.Phone, current.Email, current.PaymentTermsDays, false)));
        Assert.Equal("supplier_inactive", await (await ConvertAsync(admin, approved.Id, withMilk.Id)).ProblemCodeAsync());

        Assert.Equal(RequisitionStatus.Approved, (await admin.GetJsonAsync<RequisitionDto>($"/api/v1/requisitions/{approved.Id}"))!.Status);
        Assert.Equal(0, (await admin.GetJsonAsync<PagedResult<PurchaseOrderListItemDto>>($"/api/v1/purchase-orders?supplierId={harinas.Id}"))!.Total);
    }

    [Fact]
    public async Task Concurrent_conversions_create_the_orders_once()
    {
        var admin = await AdminAsync();
        var flour = await ItemAsync(admin);
        var harinas = await SupplierWithAsync(admin, (flour, 400m, true));
        var requisition = await ApprovedAsync(admin, await factory.LocationIdAsync("FAB"), Today, L(flour.Id, 3));

        var responses = await Task.WhenAll(ConvertAsync(admin, requisition.Id), ConvertAsync(admin, requisition.Id));

        Assert.Single(responses, r => r.IsSuccessStatusCode);
        Assert.Contains(responses.Single(r => !r.IsSuccessStatusCode).StatusCode, new[] { HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity });
        Assert.Equal(1, (await admin.GetJsonAsync<PagedResult<PurchaseOrderListItemDto>>($"/api/v1/purchase-orders?supplierId={harinas.Id}"))!.Total);
    }

    [Fact]
    public async Task Requisition_rules_on_location_date_and_suppliers()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var flour = await ItemAsync(admin);
        var orphan = await ItemAsync(admin); // no supplier sells it
        var harinas = await SupplierWithAsync(admin, (flour, 400m, false));

        Assert.Equal("requisition_location_cannot_purchase",
            await (await CreateAsync(admin, await factory.LocationIdAsync("SUC-01"), Today, L(flour.Id, 1))).ProblemCodeAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAsync(admin, fab, Today.AddDays(-1), L(flour.Id, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAsync(admin, fab, Today, L(orphan.Id, 1, harinas.Id))).StatusCode);

        // No preferred supplier: the line stays empty and the requisition cannot be submitted until one is chosen.
        var requisition = await OkAsync<RequisitionDto>(await CreateAsync(admin, fab, Today, L(flour.Id, 1), L(orphan.Id, 2)));
        Assert.All(requisition.Lines, l => Assert.Null(l.SuggestedSupplier));
        Assert.Equal("requisition_line_without_supplier", await (await ActAsync(admin, requisition, "submit")).ProblemCodeAsync());

        requisition = await OkAsync<RequisitionDto>(await admin.PutAsJsonAsync($"/api/v1/requisitions/{requisition.Id}",
            new UpdateRequisitionRequest(requisition.Version, Today.AddDays(1), "Urgente", [L(flour.Id, 3, harinas.Id)])));
        Assert.Equal((3m, harinas.Id, "Urgente"), (requisition.Lines.Single().Quantity, requisition.Lines.Single().SuggestedSupplier!.Id, requisition.Notes));

        var stale = await admin.PutAsJsonAsync($"/api/v1/requisitions/{requisition.Id}",
            new UpdateRequisitionRequest(requisition.Version - 1, Today, null, [L(flour.Id, 1, harinas.Id)]));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        requisition = await OkAsync<RequisitionDto>(await ActAsync(admin, requisition, "submit"));
        var editSubmitted = await admin.PutAsJsonAsync($"/api/v1/requisitions/{requisition.Id}",
            new UpdateRequisitionRequest(requisition.Version, Today, null, [L(flour.Id, 1, harinas.Id)]));
        Assert.Equal("requisition_invalid_status", await editSubmitted.ProblemCodeAsync());
    }

    [Fact]
    public async Task Reject_and_cancel()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var flour = await ItemAsync(admin);
        await SupplierWithAsync(admin, (flour, 400m, true));

        var submitted = await OkAsync<RequisitionDto>(await ActAsync(admin,
            await OkAsync<RequisitionDto>(await CreateAsync(admin, fab, Today, L(flour.Id, 1))), "submit"));
        var rejected = await OkAsync<RequisitionDto>(await admin.PostAsJsonAsync($"/api/v1/requisitions/{submitted.Id}/reject",
            new RejectRequisitionRequest(submitted.Version, "Hay existencia en comisariato")));
        Assert.Equal((RequisitionStatus.Rejected, "Hay existencia en comisariato"), (rejected.Status, rejected.RejectionReason));
        Assert.Equal("requisition_not_cancellable", await (await ActAsync(admin, rejected, "cancel")).ProblemCodeAsync());

        var approved = await ApprovedAsync(admin, fab, Today, L(flour.Id, 1));
        Assert.Equal(RequisitionStatus.Cancelled, (await OkAsync<RequisitionDto>(await ActAsync(admin, approved, "cancel"))).Status);
    }

    [Fact]
    public async Task Requisition_permissions_and_location_scope()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var com = await factory.LocationIdAsync("COM");
        var flour = await ItemAsync(admin);
        await SupplierWithAsync(admin, (flour, 400m, true));
        var atCom = await ApprovedAsync(admin, com, Today, L(flour.Id, 1));

        // Compras (FAB only) creates, submits and converts, but does not approve.
        var buyer = await factory.CreateUserAsync("Compras", "FAB");
        var buyerClient = await factory.CreateAuthenticatedClientAsync(buyer.Email, buyer.Password);
        var mine = await OkAsync<RequisitionDto>(await CreateAsync(buyerClient, fab, Today, L(flour.Id, 2)));
        mine = await OkAsync<RequisitionDto>(await ActAsync(buyerClient, mine, "submit"));
        Assert.Equal(HttpStatusCode.Forbidden, (await ActAsync(buyerClient, mine, "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await buyerClient.PostAsJsonAsync($"/api/v1/requisitions/{mine.Id}/reject",
            new RejectRequisitionRequest(mine.Version, "No"))).StatusCode);

        // Out of scope: COM.
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateAsync(buyerClient, com, Today, L(flour.Id, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await buyerClient.GetAsync($"/api/v1/requisitions/{atCom.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ConvertAsync(buyerClient, atCom.Id)).StatusCode);
        var visible = (await buyerClient.GetJsonAsync<PagedResult<RequisitionListItemDto>>("/api/v1/requisitions?pageSize=100"))!;
        Assert.DoesNotContain(visible.Items, r => r.Location.Id == com);

        // The operations manager approves; the buyer converts; the order is visible to FAB only.
        var manager = await factory.CreateUserAsync("Gerente de operaciones");
        var managerClient = await factory.CreateAuthenticatedClientAsync(manager.Email, manager.Password);
        mine = await OkAsync<RequisitionDto>(await ActAsync(managerClient, mine, "approve"));
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateAsync(managerClient, fab, Today, L(flour.Id, 1))).StatusCode);

        var order = Assert.Single(await OkAsync<List<PurchaseOrderListItemDto>>(await ConvertAsync(buyerClient, mine.Id)));
        Assert.Equal(HttpStatusCode.OK, (await buyerClient.GetAsync($"/api/v1/purchase-orders/{order.Id}")).StatusCode);

        var comUser = await factory.CreateUserAsync("Compras", "COM");
        var comClient = await factory.CreateAuthenticatedClientAsync(comUser.Email, comUser.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await comClient.GetAsync($"/api/v1/purchase-orders/{order.Id}")).StatusCode);

        var viewer = await factory.CreateUserAsync("Consulta", "FAB");
        var viewerClient = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);
        Assert.Equal(HttpStatusCode.OK, (await viewerClient.GetAsync("/api/v1/requisitions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateAsync(viewerClient, fab, Today, L(flour.Id, 1))).StatusCode);
    }
}
