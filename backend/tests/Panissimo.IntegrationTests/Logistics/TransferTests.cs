using System.Net;
using System.Text.Json;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Sales;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Logistics;

[Collection(ApiCollection.Name)]
public class TransferTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static async Task<string?> CodeOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString();

    private async Task<TransferDto> CreateAsync(HttpClient client, Guid from, Guid to, params TransferLineRequest[] lines)
    {
        var response = await client.PostJsonAsync("/api/v1/transfers", new CreateTransferRequest(from, to, null, lines));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<TransferDto>())!;
    }

    [Fact]
    public async Task Dispatch_and_receive_with_a_shortage_move_stock_at_the_origin_cost()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza", tracksLots: true);
        var labels = await factory.CreateItemAsync("ETQ", ItemType.Supply);
        await factory.AddStockAsync(plant, bread.Id, 30, 2.5m, "OP-9-02", Today.AddDays(3));
        await factory.AddStockAsync(plant, bread.Id, 20, 2.5m, "OP-9-01", Today.AddDays(1));
        await factory.AddStockAsync(plant, labels.Id, 50, 20);

        var transfer = await CreateAsync(admin, plant, branch, new TransferLineRequest(bread.Id, null, 36), new TransferLineRequest(labels.Id, null, 5));
        Assert.StartsWith("TR-", transfer.Folio);

        var dispatched = await (await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null))).Content.ReadJsonAsync<TransferDto>();
        Assert.Equal(TransferStatus.Dispatched, dispatched!.Status);
        Assert.Equal([("OP-9-01", 20m), ("OP-9-02", 16m)], dispatched.Lines.Where(l => l.ItemId == bread.Id).Select(l => (l.LotNumber!, l.ShippedQty)));
        Assert.Equal(14m, await factory.StockAsync(plant, bread.Id));
        Assert.Equal(0m, await factory.StockAsync(branch, bread.Id)); // in transit

        var receipt = dispatched.Lines.Select(l => l.LotNumber == "OP-9-02"
            ? new ReceiveLineRequest(l.Id, 14, DiscrepancyReason.Damaged, "Charola aplastada")
            : new ReceiveLineRequest(l.Id, l.ShippedQty, null, null)).ToList();
        var received = await (await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive",
            new ReceiveTransferRequest(dispatched.Version, receipt))).Content.ReadJsonAsync<TransferDto>();

        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, received!.Status);
        Assert.Equal(34m, await factory.StockAsync(branch, bread.Id));
        Assert.Equal(5m, received.TransitLossValue); // 2 pza × 2.5
        var kardex = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={branch}&itemId={labels.Id}");
        Assert.Equal((MovementType.TransferIn, 20m), (kardex!.Items.Single().Type, kardex.Items.Single().UnitCost));

        var tab = await admin.GetJsonAsync<PagedResult<TransferListItemDto>>($"/api/v1/transfers?tab=Received&q={transfer.Folio}");
        Assert.Single(tab!.Items);
    }

    [Fact]
    public async Task Concurrent_dispatches_of_the_same_transfer_succeed_once()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-02");
        var bags = await factory.CreateItemAsync("BOL", ItemType.Supply);
        await factory.AddStockAsync(plant, bags.Id, 100, 18);
        var transfer = await CreateAsync(admin, plant, branch, new TransferLineRequest(bags.Id, null, 30));

        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ =>
            admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch", new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null))));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order());
        Assert.Equal(70m, await factory.StockAsync(plant, bags.Id));
    }

    [Fact]
    public async Task Dispatch_without_enough_stock_returns_shortages_and_keeps_the_draft()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var bags = await factory.CreateItemAsync("BOL", ItemType.Supply);
        await factory.AddStockAsync(plant, bags.Id, 5, 18);
        var transfer = await CreateAsync(admin, plant, branch, new TransferLineRequest(bags.Id, null, 8));

        var response = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch", new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("insufficient_stock", await CodeOf(response));
        Assert.Equal(TransferStatus.Draft, (await admin.GetJsonAsync<TransferDto>($"/api/v1/transfers/{transfer.Id}"))!.Status);
    }

    [Fact]
    public async Task Special_routes_need_permission_and_pieces_must_be_whole()
    {
        var email = ApiFactory.UniqueEmail("distribucion");
        await factory.CreateUserAsync(email, ["distribution"], ["PLANTA", "SUC-01", "SUC-02"]);
        var client = await factory.LoginAsync(email);
        var plant = await factory.LocationIdAsync("PLANTA");
        var suc1 = await factory.LocationIdAsync("SUC-01");
        var suc2 = await factory.LocationIdAsync("SUC-02");
        var bread = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");

        var branchToBranch = await client.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(suc1, suc2, null, [new TransferLineRequest(bread.Id, null, 5)]));
        Assert.Equal(HttpStatusCode.Forbidden, branchToBranch.StatusCode);

        var fraction = await client.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(plant, suc1, null, [new TransferLineRequest(bread.Id, null, 2.5m)]));
        Assert.Equal(HttpStatusCode.BadRequest, fraction.StatusCode);

        var admin = await factory.LoginAsAdminAsync(); // the administrator holds logistics.transfers.special
        var returned = await admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(suc1, plant, "Devolución", [new TransferLineRequest(bread.Id, null, 5)]));
        Assert.Equal(HttpStatusCode.Created, returned.StatusCode);
    }

    [Fact]
    public async Task Transfers_reject_raw_materials_and_semi_finished_goods_on_every_route()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var suc1 = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");
        var flour = await factory.CreateItemAsync("HAR");
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);

        var mixed = await admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(plant, suc1, null, [new TransferLineRequest(bread.Id, null, 5), new TransferLineRequest(flour.Id, null, 2)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, mixed.StatusCode);
        Assert.Equal("transfer_item_not_allowed", await CodeOf(mixed));

        var returned = await admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(suc1, plant, "Devolución", [new TransferLineRequest(dough.Id, null, 1)]));
        Assert.Equal("transfer_item_not_allowed", await CodeOf(returned));

        var draft = await CreateAsync(admin, plant, suc1, new TransferLineRequest(bread.Id, null, 5));
        var edited = await admin.PutJsonAsync($"/api/v1/transfers/{draft.Id}",
            new UpdateTransferRequest(draft.Version, suc1, null, [new TransferLineRequest(flour.Id, null, 2)]));
        Assert.Equal("transfer_item_not_allowed", await CodeOf(edited));
    }

    [Fact]
    public async Task Only_the_destination_receives_and_drafts_can_be_cancelled()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var suc2 = await factory.LocationIdAsync("SUC-02");
        var bags = await factory.CreateItemAsync("BOL", ItemType.Supply);
        await factory.AddStockAsync(plant, bags.Id, 10, 18);
        var transfer = await CreateAsync(admin, plant, suc2, new TransferLineRequest(bags.Id, null, 4));
        var dispatched = await (await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null))).Content.ReadJsonAsync<TransferDto>();

        var email = ApiFactory.UniqueEmail("encargado");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var otherBranch = await factory.LoginAsync(email);
        var foreign = await otherBranch.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive",
            new ReceiveTransferRequest(dispatched!.Version, [new ReceiveLineRequest(dispatched.Lines[0].Id, 4, null, null)]));
        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);

        var cancelDispatched = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/cancel", new VersionRequest(dispatched.Version));
        Assert.Equal("transfer_not_draft", await CodeOf(cancelDispatched));

        var draft = await CreateAsync(admin, plant, suc2, new TransferLineRequest(bags.Id, null, 1));
        var cancelled = await (await admin.PostJsonAsync($"/api/v1/transfers/{draft.Id}/cancel", new VersionRequest(draft.Version)))
            .Content.ReadJsonAsync<TransferDto>();
        Assert.Equal(TransferStatus.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task Chosen_lots_override_fefo_and_expired_lots_are_rejected()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("ROL", ItemType.FinishedGood, "pza", tracksLots: true);
        await factory.AddStockAsync(plant, bread.Id, 10, 3, "VIEJO", Today.AddDays(-1));
        await factory.AddStockAsync(plant, bread.Id, 10, 3, "NUEVO", Today.AddDays(5));
        var lots = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{plant}/{bread.Id}/lots"))!;
        var expired = lots.Single(l => l.LotNumber == "VIEJO").LotId!.Value;
        var fresh = lots.Single(l => l.LotNumber == "NUEVO").LotId!.Value;

        var transfer = await CreateAsync(admin, plant, branch, new TransferLineRequest(bread.Id, null, 6));
        var withExpired = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch", new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, [new DispatchLineRequest(transfer.Lines[0].Id, [new LotQuantity(expired, 6)])]));
        Assert.Equal("lot_expired", await CodeOf(withExpired));

        var ok = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch", new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, [new DispatchLineRequest(transfer.Lines[0].Id, [new LotQuantity(fresh, 6)])]));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal("NUEVO", (await ok.Content.ReadJsonAsync<TransferDto>())!.Lines.Single().LotNumber);
    }

    [Fact]
    public async Task The_branch_rejects_part_that_returns_to_where_it_left_and_part_that_is_lost()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("DONA", ItemType.FinishedGood, "pza", tracksLots: true);
        await factory.AddStockAsync(plant, bread.Id, 30, 2.5m, "DONA-01", Today.AddDays(2));
        var transfer = await CreateAsync(admin, plant, branch, new TransferLineRequest(bread.Id, null, 30));
        var dispatched = await (await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null))).Content.ReadJsonAsync<TransferDto>();
        var line = dispatched!.Lines.Single();

        // The branch manager receives: without access to the plant, what returns still re-enters it (RN-116).
        var email = ApiFactory.UniqueEmail("encargado");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var manager = await factory.LoginAsync(email);
        var fraction = await manager.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive", new ReceiveTransferRequest(dispatched.Version,
            [new ReceiveLineRequest(line.Id, 20, null, null, Rejection: new TransferRejectionRequest(9.5m, ShipmentRejectionReason.Damaged, null,
                RejectionDisposition.Return))]));
        Assert.Equal("whole_quantity_required", await CodeOf(fraction));

        var returned = await manager.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive", new ReceiveTransferRequest(dispatched.Version,
            [new ReceiveLineRequest(line.Id, 20, DiscrepancyReason.Missing, null,
                Rejection: new TransferRejectionRequest(6, ShipmentRejectionReason.Damaged, "Aplastadas", RejectionDisposition.Return))]));
        Assert.Equal(HttpStatusCode.OK, returned.StatusCode);
        var received = (await returned.Content.ReadJsonAsync<TransferDto>())!;

        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, received.Status);
        var result = received.Lines.Single();
        Assert.Equal((20m, 6m, 4m, RejectionDisposition.Return, "Aplastadas"),
            (result.ReceivedQty!.Value, result.RejectedQty, result.ShortQty, result.RejectionDisposition!.Value, result.RejectionNotes));
        Assert.Equal((10m, 15m, 0m), (result.ShortValue!.Value, result.RejectedValue!.Value, received.RejectionLossValue));
        Assert.Equal(20m, await factory.StockAsync(branch, bread.Id));
        Assert.Equal(6m, await factory.StockAsync(plant, bread.Id));
        var kardex = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={plant}&itemId={bread.Id}");
        var back = kardex!.Items.Single(m => m.Type == MovementType.TransferIn);
        Assert.Equal((6m, 2.5m), (back.Quantity, back.UnitCost));

        // Traceability: the rejection has its own card and only what did not arrive is a loss in transit.
        var graph = await admin.GetJsonAsync<TraceGraphDto>($"/api/v1/traceability/graph?sourceType=Transfer&sourceId={transfer.Id}");
        var card = graph!.Nodes.Single(n => n.Type == TraceNodeType.Rejection);
        Assert.Equal(($"Rechazo de {transfer.Folio}", 6m, 0m, "PLANTA", "SUC-01"),
            (card.Label, card.ReturnedQty!.Value, card.LostQty!.Value, card.ReturnLocationCodes!, card.ToLocationCode!));
        Assert.Equal(4m, graph.Summary.InTransitLossQty);

        // What is lost does not move: only what was received enters the branch.
        // Expires first: FEFO takes it before the 6 that came back of DONA-01.
        await factory.AddStockAsync(plant, bread.Id, 10, 2.5m, "DONA-02", Today.AddDays(1));
        var second = await CreateAsync(admin, plant, branch, new TransferLineRequest(bread.Id, null, 10));
        var sent = await (await admin.PostJsonAsync($"/api/v1/transfers/{second.Id}/dispatch",
            new DispatchTransferRequest(second.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null))).Content.ReadJsonAsync<TransferDto>();
        var lost = await (await admin.PostJsonAsync($"/api/v1/transfers/{second.Id}/receive", new ReceiveTransferRequest(sent!.Version,
            [new ReceiveLineRequest(sent.Lines.Single().Id, 7, null, null,
                Rejection: new TransferRejectionRequest(3, ShipmentRejectionReason.ShortShelfLife, null, RejectionDisposition.Loss))])))
            .Content.ReadJsonAsync<TransferDto>();
        Assert.Equal(7.5m, lost!.RejectionLossValue);
        Assert.Equal(27m, await factory.StockAsync(branch, bread.Id));
        Assert.Equal(6m, await factory.StockAsync(plant, bread.Id));
    }
}
