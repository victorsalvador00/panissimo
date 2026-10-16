using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Logistics;
using Sgo.Application.Security;
using Sgo.Domain.Inventory;
using Sgo.Domain.Logistics;
using Sgo.Domain.Security;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Logistics;

[Collection(ApiCollection.Name)]
public class TransferTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<ItemDto> NewItemAsync(HttpClient admin, bool tracksLots) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = tracksLots });

    private static async Task StockAsync(HttpClient admin, Guid location, params AdjustmentLineRequest[] lines) =>
        (await admin.PostAsJsonAsync("/api/v1/adjustments",
            new CreateAdjustmentRequest(location, AdjustmentReason.Correction, null, lines), HttpExtensions.Json)).EnsureSuccessStatusCode();

    private static async Task<TransferDto> OkAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<TransferDto>())!;
    }

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, Guid from, Guid to, params TransferLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/transfers", new CreateTransferRequest(from, to, "Reposición", lines));

    private static Task<HttpResponseMessage> DispatchAsync(HttpClient client, TransferDto transfer, IReadOnlyList<DispatchLineRequest>? lots = null) =>
        client.PostAsJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, "Nissan NP300 ABC-123", "Juan Pérez", lots));

    private async Task<decimal> OnHandAsync(HttpClient client, Guid location, Guid item)
    {
        var page = (await client.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={location}&itemId={item}"))!;
        return page.Items.SingleOrDefault()?.OnHand ?? 0;
    }

    [Fact]
    public async Task Full_flow_dispatch_in_transit_and_receipt_with_shortage()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var branch = await factory.LocationIdAsync("SUC-02");
        var milk = await NewItemAsync(admin, tracksLots: true);
        var flour = await NewItemAsync(admin, tracksLots: false);
        await StockAsync(admin, com,
            new(milk.Id, null, "M-TARDE", Today.AddDays(20), 6, 10, null),
            new(milk.Id, null, "M-PRONTO", Today.AddDays(4), 5, 16, null),
            new(flour.Id, null, null, null, 20, 7.5m, null));

        var draft = await OkAsync(await CreateAsync(admin, com, branch, new(milk.Id, null, 8), new(flour.Id, null, 5)));
        Assert.StartsWith("TR-", draft.Folio);
        Assert.Equal(TransferStatus.Draft, draft.Status);

        var dispatched = await OkAsync(await DispatchAsync(admin, draft));
        Assert.Equal(TransferStatus.Dispatched, dispatched.Status);
        Assert.Equal("Juan Pérez", dispatched.DriverName);
        // FEFO: M-PRONTO (5) then M-TARDE (3), at the commissary's average cost (6×10 + 5×16) / 11 = 12.7273
        var milkLines = dispatched.Lines.Where(l => l.ItemId == milk.Id).ToList();
        Assert.Equal([("M-PRONTO", 5m), ("M-TARDE", 3m)], milkLines.OrderBy(l => l.ExpirationDate).Select(l => (l.LotNumber!, l.ShippedQty)));
        Assert.All(milkLines, l => Assert.Equal(12.7273m, l.UnitCost));
        Assert.Equal(3m, await OnHandAsync(admin, com, milk.Id));
        Assert.Equal(15m, await OnHandAsync(admin, com, flour.Id));

        var inTransit = (await admin.GetJsonAsync<List<TransferListItemDto>>($"/api/v1/transfers/in-transit?locationId={branch}"))!;
        Assert.Contains(inTransit, t => t.Id == draft.Id);

        // The branch manager receives: flour complete, one milk unit of the earliest lot arrived damaged.
        var manager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-02");
        var receiver = await factory.CreateAuthenticatedClientAsync(manager.Email, manager.Password);
        var receipt = dispatched.Lines.Select(l => l.LotNumber == "M-PRONTO"
            ? new ReceiveLineRequest(l.Id, l.ShippedQty - 1, DiscrepancyReason.Damaged, "Envase roto")
            : new ReceiveLineRequest(l.Id, l.ShippedQty, null, null)).ToList();

        var received = await OkAsync(await receiver.PostAsJsonAsync($"/api/v1/transfers/{draft.Id}/receive",
            new ReceiveTransferRequest(dispatched.Version, receipt), HttpExtensions.Json));

        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, received.Status);
        var damaged = received.Lines.Single(l => l.LotNumber == "M-PRONTO");
        Assert.Equal((1m, DiscrepancyReason.Damaged, 12.7273m), (damaged.ShortQty, damaged.DiscrepancyReason!.Value, damaged.ShortValue!.Value));
        Assert.Equal(12.7273m, received.TransitLossValue);

        // Who did each step comes with its name, not only its id.
        var adminName = (await admin.GetJsonAsync<MeDto>("/api/v1/me"))!.FullName;
        Assert.Equal((adminName, adminName, "Usuario de prueba"),
            (received.CreatedByName, received.DispatchedByName, received.ReceivedByName));
        Assert.Equal(manager.Id, received.ReceivedBy);
        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={branch}&itemId={flour.Id}"))!;
        Assert.Equal("Usuario de prueba", Assert.Single(kardex.Items).UserName);

        Assert.Equal(7m, await OnHandAsync(admin, branch, milk.Id));
        Assert.Equal(5m, await OnHandAsync(admin, branch, flour.Id));
        var branchStock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={branch}&itemId={flour.Id}"))!;
        Assert.Equal(7.5m, branchStock.Items[0].AverageCost); // RN-04: enters at the origin's cost
        var lots = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{branch}/{milk.Id}/lots"))!;
        Assert.Equal([("M-PRONTO", 4m), ("M-TARDE", 3m)], lots.Select(l => (l.LotNumber!, l.Quantity)));

        Assert.DoesNotContain((await admin.GetJsonAsync<List<TransferListItemDto>>($"/api/v1/transfers/in-transit?locationId={branch}"))!,
            t => t.Id == draft.Id);
        var receivedTab = (await admin.GetJsonAsync<PagedResult<TransferListItemDto>>(
            $"/api/v1/transfers?locationId={branch}&received=true&pageSize=100"))!;
        Assert.Contains(receivedTab.Items, t => t.Id == draft.Id);
        Assert.All(receivedTab.Items, t => Assert.Contains(t.Status, new[] { TransferStatus.Received, TransferStatus.ReceivedWithDiscrepancies }));
        var cancelReceived = await admin.PostAsJsonAsync($"/api/v1/transfers/{draft.Id}/cancel", new VersionRequest(received.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, cancelReceived.StatusCode);
    }

    [Fact]
    public async Task Two_simultaneous_dispatches_of_the_same_transfer_one_succeeds_and_the_other_gets_409()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(admin, tracksLots: false);
        await StockAsync(admin, com, new AdjustmentLineRequest(item.Id, null, null, null, 100, 3, null));
        var draft = await OkAsync(await CreateAsync(admin, com, await factory.LocationIdAsync("SUC-08"), new TransferLineRequest(item.Id, null, 10)));

        var clientA = await AdminAsync();
        var clientB = await AdminAsync();
        var responses = await Task.WhenAll(DispatchAsync(clientA, draft), DispatchAsync(clientB, draft));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order());
        var conflict = responses.Single(r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal("concurrency", await conflict.ProblemCodeAsync());

        Assert.Equal(90m, await OnHandAsync(admin, com, item.Id)); // dispatched exactly once
        await using var scope = factory.CreateScope();
        Assert.Equal(1, await SgoApiFactory.Db(scope).InventoryMovements
            .CountAsync(m => m.SourceDocId == draft.Id && m.Type == MovementType.TransferOut));
    }

    [Fact]
    public async Task Insufficient_stock_on_dispatch_returns_409_and_keeps_the_draft()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(admin, tracksLots: false);
        await StockAsync(admin, com, new AdjustmentLineRequest(item.Id, null, null, null, 2, 3, null));
        var draft = await OkAsync(await CreateAsync(admin, com, await factory.LocationIdAsync("SUC-08"), new TransferLineRequest(item.Id, null, 5)));

        var response = await DispatchAsync(admin, draft);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("insufficient_stock", await response.ProblemCodeAsync());
        var reloaded = (await admin.GetJsonAsync<TransferDto>($"/api/v1/transfers/{draft.Id}"))!;
        Assert.Equal((TransferStatus.Draft, draft.Version), (reloaded.Status, reloaded.Version));
        Assert.Equal(2m, await OnHandAsync(admin, com, item.Id));
    }

    [Fact]
    public async Task Chosen_lots_are_respected_on_dispatch()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(admin, tracksLots: true);
        await StockAsync(admin, com,
            new(item.Id, null, "E-PRONTO", Today.AddDays(2), 5, 10, null),
            new(item.Id, null, "E-TARDE", Today.AddDays(30), 5, 10, null));
        var lateLot = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{com}/{item.Id}/lots"))!.Single(l => l.LotNumber == "E-TARDE").LotId!.Value;
        var draft = await OkAsync(await CreateAsync(admin, com, await factory.LocationIdAsync("SUC-08"), new TransferLineRequest(item.Id, null, 4)));

        var dispatched = await OkAsync(await DispatchAsync(admin, draft, [new(draft.Lines[0].Id, [new LotQuantity(lateLot, 4)])]));

        Assert.Equal("E-TARDE", Assert.Single(dispatched.Lines).LotNumber);
    }

    [Fact]
    public async Task Dispatch_requires_the_origin_and_receipt_requires_the_destination()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(admin, tracksLots: false);
        await StockAsync(admin, com, new AdjustmentLineRequest(item.Id, null, null, null, 10, 3, null));
        var draft = await OkAsync(await CreateAsync(admin, com, await factory.LocationIdAsync("SUC-05"), new TransferLineRequest(item.Id, null, 2)));

        var otherWarehouse = await factory.CreateUserAsync("Almacén comisariato/fábrica", "FAB");
        var fabClient = await factory.CreateAuthenticatedClientAsync(otherWarehouse.Email, otherWarehouse.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await DispatchAsync(fabClient, draft)).StatusCode);

        var dispatched = await OkAsync(await DispatchAsync(admin, draft));

        var wrongBranch = await factory.CreateUserAsync("Encargado de sucursal", "SUC-03");
        var wrongClient = await factory.CreateAuthenticatedClientAsync(wrongBranch.Email, wrongBranch.Password);
        var receipt = new ReceiveTransferRequest(dispatched.Version, [new(dispatched.Lines[0].Id, 2, null, null)]);
        Assert.Equal(HttpStatusCode.Forbidden, (await wrongClient.PostAsJsonAsync($"/api/v1/transfers/{draft.Id}/receive", receipt, HttpExtensions.Json)).StatusCode);

        var rightBranch = await factory.CreateUserAsync("Encargado de sucursal", "SUC-05");
        var rightClient = await factory.CreateAuthenticatedClientAsync(rightBranch.Email, rightBranch.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await DispatchAsync(rightClient, dispatched)).StatusCode); // no dispatch permission
        Assert.Equal(HttpStatusCode.OK, (await rightClient.PostAsJsonAsync($"/api/v1/transfers/{draft.Id}/receive", receipt, HttpExtensions.Json)).StatusCode);

        // The branch sees it (destination) even without access to the commissary.
        Assert.Equal(HttpStatusCode.OK, (await rightClient.GetAsync($"/api/v1/transfers/{draft.Id}")).StatusCode);
    }

    [Fact]
    public async Task Special_routes_need_their_permission()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: false);
        var suc01 = await factory.LocationIdAsync("SUC-01");
        var suc02 = await factory.LocationIdAsync("SUC-02");

        // Dispatcher without the special permission, assigned to two branches.
        var role = (await (await admin.PostAsJsonAsync("/api/v1/roles", new CreateRoleRequest(
            CatalogTestHelpers.Unique("Despacho"), "", [Permissions.LogisticsView, Permissions.LogisticsTransfersDispatch])))
            .ReadJsonAsync<RoleDto>())!;
        var request = new CreateUserRequest($"desp-{Guid.NewGuid():N}@sgo.test", "Despachador", "Temporal2024x", [role.Id], [suc01, suc02], null);
        (await admin.PostAsJsonAsync("/api/v1/users", request)).EnsureSuccessStatusCode();
        var dispatcher = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);

        var branchToBranch = await CreateAsync(dispatcher, suc01, suc02, new TransferLineRequest(item.Id, null, 1));
        Assert.Equal(HttpStatusCode.Forbidden, branchToBranch.StatusCode);
        Assert.Contains("traspasos especiales", (await branchToBranch.ProblemAsync()).GetProperty("detail").GetString());

        // The warehouse role has it: factory ↔ commissary is allowed.
        var warehouse = await factory.CreateUserAsync("Almacén comisariato/fábrica", "COM", "FAB");
        var warehouseClient = await factory.CreateAuthenticatedClientAsync(warehouse.Email, warehouse.Password);
        Assert.Equal(HttpStatusCode.Created, (await CreateAsync(warehouseClient,
            await factory.LocationIdAsync("FAB"), await factory.LocationIdAsync("COM"), new TransferLineRequest(item.Id, null, 1))).StatusCode);
    }

    [Fact]
    public async Task Draft_can_be_edited_and_cancelled()
    {
        var admin = await AdminAsync();
        var com = await factory.LocationIdAsync("COM");
        var item = await NewItemAsync(admin, tracksLots: false);
        var draft = await OkAsync(await CreateAsync(admin, com, await factory.LocationIdAsync("SUC-08"), new TransferLineRequest(item.Id, null, 1)));

        var edited = await OkAsync(await admin.PutAsJsonAsync($"/api/v1/transfers/{draft.Id}",
            new UpdateTransferRequest(draft.Version, await factory.LocationIdAsync("SUC-10"), "Cambio de destino", [new(item.Id, null, 3)])));
        Assert.Equal(("SUC-10", 3m), (edited.To.Code, edited.Lines[0].ShippedQty));

        var cancelled = await OkAsync(await admin.PostAsJsonAsync($"/api/v1/transfers/{draft.Id}/cancel", new VersionRequest(edited.Version)));
        Assert.Equal(TransferStatus.Cancelled, cancelled.Status);
    }
}
