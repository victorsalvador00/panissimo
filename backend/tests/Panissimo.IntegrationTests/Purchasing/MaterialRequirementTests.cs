using System.Net;
using Panissimo.Application.Catalog;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Purchasing;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class MaterialRequirementTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    private async Task<MaterialRequirementDto> RequirementAsync(HttpClient client, Guid plant) =>
        (await client.GetJsonAsync<MaterialRequirementDto>($"/api/v1/material-requirements?locationId={plant}&to={Today.AddDays(7):yyyy-MM-dd}"))!;

    [Fact]
    public async Task Shortage_counts_minimum_stock_and_transit_and_becomes_a_suggested_requisition()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var flour = await factory.CreateItemAsync("HAR", purchaseUom: "bulto", purchaseToBaseFactor: 44);
        var sugar = await factory.CreateItemAsync("AZU", ItemType.Supply);
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null,
            [new RecipeLineRequest(flour.Id, 22, 0), new RecipeLineRequest(dough.Id, 10, 0), new RecipeLineRequest(sugar.Id, 1, 0)]));
        await factory.AddStockAsync(plant, flour.Id, 10, 20m);
        await factory.AddStockAsync(plant, sugar.Id, 100, 25m);
        await factory.AddStockAsync(plant, dough.Id, 5, 30m);
        await admin.PutJsonAsync($"/api/v1/items/{flour.Id}/location-settings", new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(plant, 20, 100)]));

        // A draft order in the horizon and one after it.
        await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders", new CreateProductionOrderRequest(plant, bread.Id, 300, Today.AddDays(1), null, null, null)));
        await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders", new CreateProductionOrderRequest(plant, bread.Id, 100, Today.AddDays(10), null, null, null)));

        // A preferred supplier and a draft purchase order of 1 bulto (44 kg) in transit.
        var supplier = await OkAsync<SupplierDto>(admin.PostJsonAsync("/api/v1/suppliers",
            new CreateSupplierRequest($"MOL980312{Random.Shared.Next(100, 999)}", "Molino", null, null, null, 0)));
        await OkAsync<SupplierItemDto>(admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items", new CreateSupplierItemRequest(flour.Id, null, 880, 2, true)));
        await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplier.Id, plant, Today.AddDays(2), null,
            [new PurchaseOrderLineRequest(null, flour.Id, 1, null)])));

        var requirement = await RequirementAsync(admin, plant);
        var flourRow = requirement.Rows.Single(r => r.ItemId == flour.Id);
        // 66 required (300 / 100 × 22) + 20 min − 10 stock − 44 ordered = 32 kg → 1 whole bulto.
        Assert.Equal((66m, 20m, 10m, 44m, 32m, 1m, RequirementStatus.ToBuy, supplier.Id),
            (flourRow.Required, flourRow.MinQty, flourRow.Stock, flourRow.InTransitOrders, flourRow.Shortage, flourRow.SuggestedPurchaseQty!.Value,
                flourRow.Status, flourRow.PreferredSupplierId!.Value));
        Assert.Single(flourRow.Orders);
        var doughRow = requirement.Rows.Single(r => r.ItemId == dough.Id);
        Assert.Equal((25m, RequirementStatus.ToProduce, (decimal?)null), (doughRow.Shortage, doughRow.Status, doughRow.SuggestedPurchaseQty));
        Assert.Equal(RequirementStatus.Covered, requirement.Rows.Single(r => r.ItemId == sugar.Id).Status);

        // The suggested requisition is a normal draft with the preferred supplier.
        var requisition = await OkAsync<RequisitionDto>(admin.PostJsonAsync("/api/v1/requisitions/suggested",
            new CreateSuggestedRequisitionRequest(plant, Today.AddDays(7), null, [flour.Id])));
        Assert.Equal((RequisitionStatus.Draft, Today.AddDays(1)), (requisition.Status, requisition.NeededBy));
        var line = requisition.Lines.Single();
        Assert.Equal((flour.Id, 1m, supplier.Id), (line.ItemId, line.Quantity, line.SuggestedSupplierId!.Value));

        // Now it is in transit: covered, and nothing left to suggest.
        flourRow = (await RequirementAsync(admin, plant)).Rows.Single(r => r.ItemId == flour.Id);
        Assert.Equal((44m, RequirementStatus.Covered), (flourRow.InTransitRequisitions, flourRow.Status));
        var again = await admin.PostJsonAsync("/api/v1/requisitions/suggested", new CreateSuggestedRequisitionRequest(plant, Today.AddDays(7), null, [flour.Id]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, again.StatusCode);
    }

    [Fact]
    public async Task Production_reads_the_requirement_and_purchasing_creates_the_requisition()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var email = ApiFactory.UniqueEmail("supervisor");
        await factory.CreateUserAsync(email, ["production_supervisor"], ["PLANTA"]);
        var supervisor = await factory.LoginAsync(email);

        Assert.Equal(HttpStatusCode.OK, (await supervisor.GetAsync($"/api/v1/material-requirements?locationId={plant}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await supervisor.PostJsonAsync("/api/v1/requisitions/suggested",
            new CreateSuggestedRequisitionRequest(plant, null, null, null))).StatusCode);

        var admin = await factory.LoginAsAdminAsync();
        var atBranch = await admin.GetAsync($"/api/v1/material-requirements?locationId={await factory.LocationIdAsync("SUC-01")}");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, atBranch.StatusCode);
    }
}
