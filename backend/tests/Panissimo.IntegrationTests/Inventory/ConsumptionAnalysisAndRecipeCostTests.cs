using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Catalog;
using Panissimo.Application.Inventory;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class ConsumptionAnalysisAndRecipeCostTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    /// <summary>
    /// Posts one movement as its own document and moves it to <paramref name="date"/>: the API only posts today, and the
    /// analysis needs history (test data only).
    /// </summary>
    private async Task PostOnAsync(DateOnly date, Guid locationId, Guid itemId, MovementType type, decimal quantity, decimal? unitCost = null,
        string docType = "Test")
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var docId = Guid.NewGuid();
        await using var tx = await db.Database.BeginTransactionAsync();
        await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync(
            [new MovementRequest(locationId, itemId, null, type, quantity, unitCost, docType, docId, "TEST", null)], default);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        await db.InventoryMovements.Where(m => m.SourceDocId == docId).ExecuteUpdateAsync(s => s.SetProperty(m => m.BusinessDate, date));
    }

    /// <summary>
    /// B-23 (RN-52): 8 weeks of a branch's consumption, 8 pza a day the first 4 weeks and 12 the last 4, plus exits outside
    /// the period and an internal voucher that do not count: 10 a day, +50 % of trend, the same every weekday; suggested
    /// min/max 20/70 with the default 2/7 cover days.
    /// </summary>
    [Fact]
    public async Task Eight_weeks_of_history_give_average_pattern_trend_and_suggested_min_max()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await factory.LocationIdAsync("SUC-01");
        var donut = await factory.CreateItemAsync("DONA", ItemType.FinishedGood, "pza");
        await factory.AddStockAsync(branch, donut.Id, 2000, 5);
        for (var daysAgo = 1; daysAgo <= 56; daysAgo++)
            await PostOnAsync(Today.AddDays(-daysAgo), branch, donut.Id, MovementType.Consumption, daysAgo <= 28 ? -12 : -8);
        await PostOnAsync(Today, branch, donut.Id, MovementType.Consumption, -100);                    // today: not a complete day
        await PostOnAsync(Today.AddDays(-57), branch, donut.Id, MovementType.CustomerShipment, -100);  // before the 8 weeks
        await PostOnAsync(Today.AddDays(-3), branch, donut.Id, MovementType.TransferOut, -50, docType: Transfer.InternalDocType);
        await admin.PutJsonAsync($"/api/v1/items/{donut.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(branch, 5, 15)]));

        var analysis = await admin.GetJsonAsync<ConsumptionAnalysisDto>($"/api/v1/consumption-analysis?locationId={branch}&q={donut.Sku}");
        Assert.Equal((8, Today.AddDays(-56), Today.AddDays(-1)), (analysis!.Weeks, analysis.From, analysis.To));
        var row = analysis.Rows.Single();
        Assert.Equal((560m, 10m, (decimal?)50m), (row.Total, row.DailyAverage, row.TrendPct));
        Assert.All(row.ByWeekday, day => Assert.Equal(10m, day));
        Assert.Equal(((decimal?)5m, (decimal?)15m, 20m, 70m), (row.CurrentMin, row.CurrentMax, row.SuggestedMin, row.SuggestedMax));

        // Four weeks: only the 12-a-day weeks, without trend.
        var four = await admin.GetJsonAsync<ConsumptionAnalysisDto>($"/api/v1/consumption-analysis?locationId={branch}&weeks=4&q={donut.Sku}");
        Assert.Equal((336m, 12m, (decimal?)null), (four!.Rows.Single().Total, four.Rows.Single().DailyAverage, four.Rows.Single().TrendPct));

        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync($"/api/v1/consumption-analysis?locationId={branch}&weeks=27")).StatusCode);
    }

    /// <summary>
    /// B-23 (RN-51): a used recipe edited into version 2 (more flour). Each version is costed at today's average costs; the
    /// sugar, received at $10 and then $12 (+20 %), is marked as an increase in both.
    /// </summary>
    [Fact]
    public async Task Each_recipe_version_is_costed_and_marks_the_components_that_rose()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("CUERNO", ItemType.FinishedGood, "pza");
        var flour = await factory.CreateItemAsync("HAR");
        var sugar = await factory.CreateItemAsync("AZU");
        await factory.AddStockAsync(plant, flour.Id, 100, 20);
        await PostOnAsync(Today.AddDays(-40), plant, sugar.Id, MovementType.PurchaseReceipt, 5, 10);
        await PostOnAsync(Today, plant, sugar.Id, MovementType.PurchaseReceipt, 5, 12); // average 11

        var v1 = (await (await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null,
            [new RecipeLineRequest(flour.Id, 5, 0), new RecipeLineRequest(sugar.Id, 1, 10)]))).Content.ReadJsonAsync<RecipeDto>())!;
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Recipes.SingleAsync(r => r.Id == v1.Id)).MarkUsed();
            await db.SaveChangesAsync();
        }
        v1 = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{v1.Id}"))!;
        var v2 = (await (await admin.PutJsonAsync($"/api/v1/recipes/{v1.Id}", new UpdateRecipeRequest(v1.Version, 100, null,
            [new RecipeLineRequest(flour.Id, 6, 0), new RecipeLineRequest(sugar.Id, 1, 10)]))).Content.ReadJsonAsync<RecipeDto>())!;
        Assert.Equal(2, v2.RecipeVersion);

        var costs = await admin.GetJsonAsync<RecipeCostsDto>($"/api/v1/recipes/{v1.Id}/costs?locationId={plant}");
        Assert.Equal(bread.Sku, costs!.OutputSku);
        // v2: 6 × 20 + 1 × 1.1 × 11 = 132.1 → 1.321 per piece; v1: 5 × 20 + 12.1 = 112.1 → 1.121.
        Assert.Equal([(2, true, 132.1m, 1.321m, 1), (1, false, 112.1m, 1.121m, 1)],
            costs.Versions.Select(v => (v.RecipeVersion, v.IsActive, v.TotalCost, v.UnitCost, v.IncreaseCount)));
        var sugarLine = costs.Versions[0].Lines.Single(l => l.ComponentItemId == sugar.Id);
        Assert.Equal((11m, 12.1m, 10m, 12m, 20m), (sugarLine.AverageCost, sugarLine.LineCost, sugarLine.Increase!.PreviousCost,
            sugarLine.Increase.LastCost, sugarLine.Increase.IncreasePct));
        Assert.Null(costs.Versions[0].Lines.Single(l => l.ComponentItemId == flour.Id).Increase);

        Assert.Equal(HttpStatusCode.NotFound,
            (await admin.GetAsync($"/api/v1/recipes/{Guid.NewGuid()}/costs?locationId={plant}")).StatusCode);
    }
}
