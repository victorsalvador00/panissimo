using System.Net;
using System.Net.Http.Json;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Inventory;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class CountAndConsumptionTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<ItemDto> NewItemAsync(HttpClient admin, Guid categoryId, bool tracksLots) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync(categoryId)) with { TracksLots = tracksLots });

    private static async Task StockAsync(HttpClient admin, Guid location, params AdjustmentLineRequest[] lines)
    {
        var response = await admin.PostAsJsonAsync("/api/v1/adjustments",
            new CreateAdjustmentRequest(location, AdjustmentReason.Correction, null, lines), HttpExtensions.Json);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<PhysicalCountDto> SendAsync(HttpClient client, HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.ReadJsonAsync<PhysicalCountDto>())!;
    }

    private static async Task<PhysicalCountDto> StartCountAsync(HttpClient client, Guid location, Guid categoryId)
    {
        var draft = await SendAsync(client, await client.PostAsJsonAsync("/api/v1/physical-counts",
            new CreatePhysicalCountRequest(location, categoryId, "Conteo semanal")));
        return await SendAsync(client, await client.PostAsJsonAsync($"/api/v1/physical-counts/{draft.Id}/start", new VersionRequest(draft.Version)));
    }

    [Fact]
    public async Task Closing_a_count_posts_the_difference_against_the_snapshot()
    {
        var admin = await AdminAsync();
        var location = await factory.LocationIdAsync("SUC-04");
        var category = await admin.CreateCategoryAsync();
        var a = await NewItemAsync(admin, category.Id, tracksLots: false);
        var b = await NewItemAsync(admin, category.Id, tracksLots: true);
        var c = await NewItemAsync(admin, category.Id, tracksLots: false);
        await StockAsync(admin, location,
            new(a.Id, null, null, null, 10, 5, null),
            new(b.Id, null, "L1", Today.AddDays(20), 6, 8, null),
            new(c.Id, null, null, null, 5, 4, null));

        var count = await StartCountAsync(admin, location, category.Id);
        Assert.StartsWith("CF-", count.Folio);
        Assert.Equal(PhysicalCountStatus.InProgress, count.Status);
        Assert.Equal(3, count.Lines.Count);
        Assert.Equal(10m, count.Lines.Single(l => l.ItemId == a.Id).SnapshotQty);

        // While counting, the branch keeps selling: 2 of A are consumed.
        var consumption = await admin.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(location, null, null, [new(a.Id, null, 2)]), HttpExtensions.Json);
        Assert.Equal(HttpStatusCode.Created, consumption.StatusCode);

        var line = (Guid item) => count.Lines.Single(l => l.ItemId == item).Id;
        count = await SendAsync(admin, await admin.PutAsJsonAsync($"/api/v1/physical-counts/{count.Id}", new UpdatePhysicalCountRequest(
            count.Version, category.Id, "Conteo semanal", [
                new(line(a.Id), null, null, null, null, 7),                       // −3 vs snapshot
                new(line(b.Id), null, null, null, null, 6),                       //  0
                new(line(c.Id), null, null, null, null, 8),                       // +3
                new(null, b.Id, null, "L-NUEVO", Today.AddDays(40), 2),           // found: +2
            ]), HttpExtensions.Json));
        Assert.Equal(4, count.Lines.Count);
        Assert.Equal(0m, count.Lines.Single(l => l.LotNumber == "L-NUEVO").SnapshotQty);

        var closed = await SendAsync(admin, await admin.PostAsJsonAsync($"/api/v1/physical-counts/{count.Id}/close", new VersionRequest(count.Version)));

        Assert.Equal(PhysicalCountStatus.Closed, closed.Status);
        Assert.Equal([(a.Sku, -3m), (b.Sku, 2m), (c.Sku, 3m)],
            closed.Movements.Select(m => (m.Sku, m.Quantity)).OrderBy(m => m.Sku == a.Sku ? 0 : m.Sku == b.Sku ? 1 : 2));

        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={location}&categoryId={category.Id}"))!;
        Assert.Equal(5m, stock.Items.Single(s => s.ItemId == a.Id).OnHand); // 10 − 2 sold − 3 difference
        Assert.Equal(8m, stock.Items.Single(s => s.ItemId == b.Id).OnHand);
        Assert.Equal(8m, stock.Items.Single(s => s.ItemId == c.Id).OnHand);

        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={location}&itemId={a.Id}"))!;
        Assert.Equal(MovementType.PhysicalCountAdjustment, kardex.Items[0].Type);
        Assert.Equal(closed.Folio, kardex.Items[0].SourceDocFolio);
    }

    [Fact]
    public async Task Count_rules_incomplete_lines_one_in_progress_and_invalid_transitions()
    {
        var admin = await AdminAsync();
        var location = await factory.LocationIdAsync("SUC-03");
        var category = await admin.CreateCategoryAsync();
        var item = await NewItemAsync(admin, category.Id, tracksLots: false);
        await StockAsync(admin, location, new AdjustmentLineRequest(item.Id, null, null, null, 4, 1, null));

        var count = await StartCountAsync(admin, location, category.Id);

        var incomplete = await admin.PostAsJsonAsync($"/api/v1/physical-counts/{count.Id}/close", new VersionRequest(count.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, incomplete.StatusCode);
        Assert.Equal("count_incomplete", await incomplete.ProblemCodeAsync());

        var second = await SendAsync(admin, await admin.PostAsJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(location, null, null)));
        var secondStart = await admin.PostAsJsonAsync($"/api/v1/physical-counts/{second.Id}/start", new VersionRequest(second.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, secondStart.StatusCode);
        Assert.Equal("count_already_in_progress", await secondStart.ProblemCodeAsync());

        var cancelled = await SendAsync(admin, await admin.PostAsJsonAsync($"/api/v1/physical-counts/{count.Id}/cancel", new VersionRequest(count.Version)));
        Assert.Equal(PhysicalCountStatus.Cancelled, cancelled.Status);

        var restart = await admin.PostAsJsonAsync($"/api/v1/physical-counts/{count.Id}/start", new VersionRequest(cancelled.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, restart.StatusCode);

        var stale = await admin.PostAsJsonAsync($"/api/v1/physical-counts/{second.Id}/cancel", new VersionRequest(second.Version + 1));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        // Once the other count is cancelled, the location accepts a new one.
        Assert.Equal(HttpStatusCode.OK,
            (await admin.PostAsJsonAsync($"/api/v1/physical-counts/{second.Id}/start", new VersionRequest(second.Version))).StatusCode);
        await admin.PostAsJsonAsync($"/api/v1/physical-counts/{second.Id}/cancel",
            new VersionRequest((await admin.GetJsonAsync<PhysicalCountDto>($"/api/v1/physical-counts/{second.Id}"))!.Version));
    }

    [Fact]
    public async Task Consumption_is_branch_only_uses_fefo_and_rejects_shortages()
    {
        var admin = await AdminAsync();
        var branch = await factory.LocationIdAsync("SUC-06");
        var category = await admin.CreateCategoryAsync();
        var milk = await NewItemAsync(admin, category.Id, tracksLots: true);
        await StockAsync(admin, branch,
            new(milk.Id, null, "TARDE", Today.AddDays(9), 5, 10, null),
            new(milk.Id, null, "PRONTO", Today.AddDays(2), 5, 10, null));

        var manager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-06");
        var client = await factory.CreateAuthenticatedClientAsync(manager.Email, manager.Password);

        var created = await client.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(branch, Today.AddDays(-1), "Turno matutino", [new(milk.Id, null, 7)]), HttpExtensions.Json);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var entry = (await created.ReadJsonAsync<ConsumptionDto>())!;
        Assert.StartsWith("CON-", entry.Folio);
        Assert.Equal(Today.AddDays(-1), entry.BusinessDate);
        Assert.Equal([("PRONTO", -5m), ("TARDE", -2m)], entry.Movements.Select(m => (m.LotNumber!, m.Quantity)));

        var shortage = await client.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(branch, null, null, [new(milk.Id, null, 10)]), HttpExtensions.Json);
        Assert.Equal(HttpStatusCode.Conflict, shortage.StatusCode);
        Assert.Equal("insufficient_stock", await shortage.ProblemCodeAsync());

        var future = await client.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(branch, Today.AddDays(2), null, [new(milk.Id, null, 1)]), HttpExtensions.Json);
        Assert.Equal("consumption_future_date", await future.ProblemCodeAsync());

        var otherBranch = await client.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(await factory.LocationIdAsync("SUC-02"), null, null, [new(milk.Id, null, 1)]), HttpExtensions.Json);
        Assert.Equal(HttpStatusCode.Forbidden, otherBranch.StatusCode);

        var commissary = await admin.PostAsJsonAsync("/api/v1/consumptions",
            new CreateConsumptionRequest(await factory.LocationIdAsync("COM"), null, null, [new(milk.Id, null, 1)]), HttpExtensions.Json);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, commissary.StatusCode);
        Assert.Equal("consumption_branch_only", await commissary.ProblemCodeAsync());

        var list = (await client.GetJsonAsync<PagedResult<ConsumptionListItemDto>>($"/api/v1/consumptions?locationId={branch}"))!;
        Assert.Contains(list.Items, i => i.Id == entry.Id && i.TotalCost == -70m);
    }

    [Fact]
    public async Task Counting_requires_its_permission()
    {
        var viewer = await factory.CreateUserAsync("Consulta", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);

        var response = await client.PostAsJsonAsync("/api/v1/physical-counts",
            new CreatePhysicalCountRequest(await factory.LocationIdAsync("SUC-01"), null, null));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
