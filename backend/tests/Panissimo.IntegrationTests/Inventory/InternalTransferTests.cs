using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

/// <summary>B-26b: internal vouchers between sub-warehouses (RN-47). Tests use their own branches, never the shared plant.</summary>
[Collection(ApiCollection.Name)]
public class InternalTransferTests(ApiFactory factory)
{
    private static string Code(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..(prefix.Length + 6)].ToUpperInvariant();

    private static async Task<LocationDto> CreateLocationAsync(HttpClient admin, CreateLocationRequest request) =>
        (await (await admin.PostJsonAsync("/api/v1/locations", request)).Content.ReadJsonAsync<LocationDto>())!;

    private static async Task<(LocationDto Branch, LocationDto Storeroom, LocationDto Showcase)> BranchAsync(HttpClient admin)
    {
        var branch = await CreateLocationAsync(admin, new CreateLocationRequest(Code("S"), "Sucursal", LocationType.Branch, null));
        var storeroom = await CreateLocationAsync(admin, new CreateLocationRequest(branch.Code + "-B", "Bodega", LocationType.Warehouse, null, branch.Id));
        var showcase = await CreateLocationAsync(admin, new CreateLocationRequest(branch.Code + "-V", "Vitrina", LocationType.Warehouse, null, branch.Id));
        return (branch, storeroom, showcase);
    }

    private static async Task<TransferDto> CreateAsync(HttpClient client, Guid from, Guid to, Guid itemId, decimal qty)
    {
        var response = await client.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(from, to, "Surtido de vitrina", [new TransferLineRequest(itemId, null, qty)]));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<TransferDto>())!;
    }

    private async Task<HttpClient> UserOfAsync(string locationCode)
    {
        var email = ApiFactory.UniqueEmail("almacen");
        await factory.CreateUserAsync(email, ["plant_warehouse"], [locationCode]);
        return await factory.LoginAsync(email);
    }

    [Fact]
    public async Task A_voucher_leaves_the_origin_travels_and_enters_the_destination_with_its_lot_and_cost()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, storeroom, showcase) = await BranchAsync(admin);
        var butter = await factory.CreateItemAsync("MAN", tracksLots: true, shelfLifeDays: 30);
        await factory.AddStockAsync(storeroom.Id, butter.Id, 20, 55m, "L-1", ApiFactory.Today.AddDays(20));

        var voucher = await CreateAsync(admin, storeroom.Id, showcase.Id, butter.Id, 12);
        Assert.Equal((TransferKind.Internal, TransferStatus.Draft), (voucher.Kind, voucher.Status));
        Assert.StartsWith("VI-", voucher.Folio);

        var dispatch = await admin.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/dispatch", new DispatchInternalTransferRequest(voucher.Version, null));
        Assert.Equal(HttpStatusCode.OK, dispatch.StatusCode);
        voucher = (await dispatch.Content.ReadJsonAsync<TransferDto>())!;
        Assert.Equal((TransferStatus.Dispatched, null), (voucher.Status, voucher.VehicleDescription));
        Assert.Equal((8m, 0m), (await factory.StockAsync(storeroom.Id, butter.Id), await factory.StockAsync(showcase.Id, butter.Id)));

        var line = voucher.Lines.Single();
        var receive = await admin.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/receive", new ReceiveTransferRequest(voucher.Version,
            [new ReceiveLineRequest(line.Id, 10, DiscrepancyReason.Damaged, "Dos piezas aplastadas")]));
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);
        voucher = (await receive.Content.ReadJsonAsync<TransferDto>())!;
        Assert.Equal((TransferStatus.ReceivedWithDiscrepancies, 110m), (voucher.Status, voucher.TransitLossValue));
        Assert.Equal(10m, await factory.StockAsync(showcase.Id, butter.Id));

        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={showcase.Id}&itemId={butter.Id}"))!;
        var entry = kardex.Items.Single();
        Assert.Equal((MovementType.TransferIn, "InternalTransfer", voucher.Folio, "L-1", 55m),
            (entry.Type, entry.SourceDocType, entry.SourceDocFolio, entry.LotNumber, entry.UnitCost));

        var listed = (await admin.GetJsonAsync<PagedResult<TransferListItemDto>>($"/api/v1/internal-transfers?q={voucher.Folio}"))!;
        Assert.Equal([voucher.Id], listed.Items.Select(t => t.Id));
        Assert.Empty((await admin.GetJsonAsync<PagedResult<TransferListItemDto>>($"/api/v1/transfers?q={voucher.Folio}"))!.Items);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/transfers/{voucher.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_voucher_stays_inside_one_location()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (branch, storeroom, showcase) = await BranchAsync(admin);
        var (_, otherStoreroom, _) = await BranchAsync(admin);
        var sugar = await factory.CreateItemAsync("AZU");

        foreach (var (from, to) in new[] { (storeroom.Id, otherStoreroom.Id), (storeroom.Id, branch.Id), (storeroom.Id, storeroom.Id) })
        {
            var response = await admin.PostJsonAsync("/api/v1/internal-transfers",
                new CreateInternalTransferRequest(from, to, null, [new TransferLineRequest(sugar.Id, null, 1)]));
            Assert.True(response.StatusCode is HttpStatusCode.UnprocessableEntity or HttpStatusCode.BadRequest, $"{from} → {to}");
        }

        // Without stock in the origin the dispatch fails and nothing moves.
        var voucher = await CreateAsync(admin, storeroom.Id, showcase.Id, sugar.Id, 5);
        var dispatch = await admin.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/dispatch", new DispatchInternalTransferRequest(voucher.Version, null));
        Assert.Equal(HttpStatusCode.Conflict, dispatch.StatusCode);
        Assert.Contains("insufficient_stock", await dispatch.Content.ReadAsStringAsync());

        var cancel = await admin.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/cancel", new VersionRequest(voucher.Version));
        Assert.Equal(TransferStatus.Cancelled, (await cancel.Content.ReadJsonAsync<TransferDto>())!.Status);
    }

    [Fact]
    public async Task Sending_needs_the_origin_warehouse_and_receiving_the_destination()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, storeroom, showcase) = await BranchAsync(admin);
        var sugar = await factory.CreateItemAsync("AZU");
        await factory.AddStockAsync(storeroom.Id, sugar.Id, 10, 20m);
        var storeroomUser = await UserOfAsync(storeroom.Code);
        var showcaseUser = await UserOfAsync(showcase.Code);

        var forbidden = await showcaseUser.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(storeroom.Id, showcase.Id, null, [new TransferLineRequest(sugar.Id, null, 1)]));
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var voucher = await CreateAsync(storeroomUser, storeroom.Id, showcase.Id, sugar.Id, 4);
        voucher = (await (await storeroomUser.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/dispatch",
            new DispatchInternalTransferRequest(voucher.Version, null))).Content.ReadJsonAsync<TransferDto>())!;

        var receive = new ReceiveTransferRequest(voucher.Version, [new ReceiveLineRequest(voucher.Lines.Single().Id, 4, null, null)]);
        Assert.Equal(HttpStatusCode.Forbidden, (await storeroomUser.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/receive", receive)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await showcaseUser.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/receive", receive)).StatusCode);
        Assert.Equal(4m, await factory.StockAsync(showcase.Id, sugar.Id));

        // The branch manager role moves vouchers too; roles without the permission do not.
        var email = ApiFactory.UniqueEmail("supervisor");
        await factory.CreateUserAsync(email, ["production_supervisor"], [storeroom.Code]);
        var supervisor = await factory.LoginAsync(email);
        Assert.Equal(HttpStatusCode.Forbidden, (await supervisor.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(storeroom.Id, showcase.Id, null, [new TransferLineRequest(sugar.Id, null, 1)]))).StatusCode);
    }
}
