using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class CountAndConsumptionTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    /// <summary>A branch of its own so counts of other tests (one in progress per location) do not interfere.</summary>
    private async Task<Guid> NewBranchAsync(HttpClient admin)
    {
        var code = $"SUC-{Random.Shared.Next(1000, 9999)}";
        var response = await admin.PostJsonAsync("/api/v1/locations",
            new Panissimo.Application.Organization.CreateLocationRequest(code, "Sucursal de conteo", Domain.Organization.LocationType.Branch, null));
        return (await response.Content.ReadJsonAsync<Panissimo.Application.Organization.LocationDto>())!.Id;
    }

    [Fact]
    public async Task Closing_posts_the_difference_against_the_snapshot_and_respects_movements_during_the_count()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await NewBranchAsync(admin);
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza", tracksLots: true);
        var sugar = await factory.CreateItemAsync("AZU");
        await factory.AddStockAsync(branch, bread.Id, 30, 2, "OP-1-01", Today.AddDays(2));
        await factory.AddStockAsync(branch, sugar.Id, 10, 20);

        var count = await (await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(branch, null, "Semanal")))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        Assert.StartsWith("CF-", count!.Folio);
        count = await (await admin.PostJsonAsync($"/api/v1/physical-counts/{count.Id}/start", new VersionRequest(count.Version)))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        Assert.Equal(2, count!.Lines.Count);

        // Sold during the count: the adjustment must only correct what the count found, not this consumption.
        await admin.PostJsonAsync("/api/v1/consumptions", new CreateConsumptionRequest(branch, null, null,
            [new ConsumptionLineRequest(bread.Id, null, 6)]));

        var breadLine = count.Lines.Single(l => l.ItemId == bread.Id);
        var sugarLine = count.Lines.Single(l => l.ItemId == sugar.Id);
        var saved = await admin.PutJsonAsync($"/api/v1/physical-counts/{count.Id}", new UpdatePhysicalCountRequest(count.Version, null, null,
        [
            new CountInput(breadLine.Id, null, null, null, null, 28),
            new CountInput(sugarLine.Id, null, null, null, null, 10),
            new CountInput(null, bread.Id, null, "OP-1-02", Today.AddDays(3), 4),
        ]));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        count = await saved.Content.ReadJsonAsync<PhysicalCountDto>();
        Assert.Equal(3, count!.Lines.Count);

        var closed = await (await admin.PostJsonAsync($"/api/v1/physical-counts/{count.Id}/close", new VersionRequest(count.Version)))
            .Content.ReadJsonAsync<PhysicalCountDto>();

        Assert.Equal(PhysicalCountStatus.Closed, closed!.Status);
        Assert.Equal([("OP-1-01", -2m), ("OP-1-02", 4m)], closed.Movements.OrderBy(m => m.LotNumber).Select(m => (m.LotNumber, m.Quantity)));
        Assert.Equal(26m, await factory.StockAsync(branch, bread.Id)); // 30 − 6 sold − 2 missing + 4 found
    }

    [Fact]
    public async Task Only_one_count_in_progress_per_location_and_close_requires_every_line()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await NewBranchAsync(admin);
        var item = await factory.CreateItemAsync("LEV");
        await factory.AddStockAsync(branch, item.Id, 3, 5);

        var first = await (await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(branch, null, null)))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        var second = await (await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(branch, null, null)))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        first = await (await admin.PostJsonAsync($"/api/v1/physical-counts/{first!.Id}/start", new VersionRequest(first.Version)))
            .Content.ReadJsonAsync<PhysicalCountDto>();

        var blocked = await admin.PostJsonAsync($"/api/v1/physical-counts/{second!.Id}/start", new VersionRequest(second.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, blocked.StatusCode);
        Assert.Contains("count_already_in_progress", await blocked.Content.ReadAsStringAsync());

        var incomplete = await admin.PostJsonAsync($"/api/v1/physical-counts/{first!.Id}/close", new VersionRequest(first.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, incomplete.StatusCode);
        Assert.Contains("count_incomplete", await incomplete.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Lines_can_be_added_and_pieces_must_be_counted_whole()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await NewBranchAsync(admin);
        var bread = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");
        var count = await (await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(branch, null, null)))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        count = await (await admin.PostJsonAsync($"/api/v1/physical-counts/{count!.Id}/start", new VersionRequest(count.Version)))
            .Content.ReadJsonAsync<PhysicalCountDto>();
        Assert.Empty(count!.Lines);

        var added = await admin.PostJsonAsync($"/api/v1/physical-counts/{count.Id}/lines", new AddCountLineRequest(count.Version, bread.Id, null, null, null));
        Assert.Equal(HttpStatusCode.OK, added.StatusCode);
        count = await added.Content.ReadJsonAsync<PhysicalCountDto>();
        var line = Assert.Single(count!.Lines);
        Assert.Null(line.CountedQty);

        var fraction = await admin.PutJsonAsync($"/api/v1/physical-counts/{count.Id}", new UpdatePhysicalCountRequest(count.Version, null, null,
            [new CountInput(line.Id, null, null, null, null, 2.5m)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, fraction.StatusCode);
        Assert.Contains("whole_quantity_required", await fraction.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Consumption_is_only_for_branches_today_or_earlier_and_follows_fefo()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await factory.LocationIdAsync("SUC-01");
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("ROSCA", ItemType.FinishedGood, "pza", tracksLots: true);
        await factory.AddStockAsync(branch, bread.Id, 5, 3, "TARDE", Today.AddDays(4));
        await factory.AddStockAsync(branch, bread.Id, 5, 3, "PRONTO", Today.AddDays(1));

        var atPlant = await admin.PostJsonAsync("/api/v1/consumptions", new CreateConsumptionRequest(plant, null, null,
            [new ConsumptionLineRequest(bread.Id, null, 1)]));
        Assert.Contains("consumption_branch_only", await atPlant.Content.ReadAsStringAsync());

        var future = await admin.PostJsonAsync("/api/v1/consumptions", new CreateConsumptionRequest(branch, Today.AddDays(1), null,
            [new ConsumptionLineRequest(bread.Id, null, 1)]));
        Assert.Contains("consumption_future_date", await future.Content.ReadAsStringAsync());

        var ok = await admin.PostJsonAsync("/api/v1/consumptions", new CreateConsumptionRequest(branch, Today.AddDays(-1), "Venta de ayer",
            [new ConsumptionLineRequest(bread.Id, null, 7)]));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var entry = await ok.Content.ReadJsonAsync<ConsumptionDto>();
        Assert.StartsWith("CON-", entry!.Folio);
        Assert.Equal([("PRONTO", -5m), ("TARDE", -2m)], entry.Movements.Select(m => (m.LotNumber, m.Quantity)));
        Assert.Equal(-21m, entry.TotalCost);

        var list = await admin.GetJsonAsync<PagedResult<ConsumptionListItemDto>>($"/api/v1/consumptions?locationId={branch}&from={Today.AddDays(-1):yyyy-MM-dd}");
        Assert.Contains(list!.Items, c => c.Id == entry.Id && c.LineCount == 1);
    }

    [Fact]
    public async Task Branch_manager_counts_and_consumes_only_at_its_branch()
    {
        var email = ApiFactory.UniqueEmail("encargado");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var client = await factory.LoginAsync(email);
        var otherBranch = await factory.LocationIdAsync("SUC-02");

        var count = await client.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(otherBranch, null, null));
        Assert.Equal(HttpStatusCode.Forbidden, count.StatusCode);
    }
}
