using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.UnitTests.Domain;

/// <summary>RN-50a..c: reservations, default origins and ingredients vouchers.</summary>
public class StockReservationTests
{
    private static readonly Guid RawMaterials = Guid.NewGuid();
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Sugar = Guid.NewGuid();

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Fact]
    public void Free_stock_is_usable_minus_reserved_never_negative()
    {
        Assert.Equal(7m, StockReservationRules.Free(10, 3));
        Assert.Equal(0m, StockReservationRules.Free(2, 5));
    }

    [Fact]
    public void A_release_falls_short_when_it_asks_for_more_than_is_free()
    {
        var free = new Dictionary<(Guid, Guid), decimal> { [(RawMaterials, Flour)] = 5, [(RawMaterials, Sugar)] = 1 };
        var shortages = StockReservationRules.Shortages(
            [(RawMaterials, Flour, 3m), (RawMaterials, Flour, 2m), (RawMaterials, Sugar, 1.5m)],
            (location, item) => free.GetValueOrDefault((location, item)));

        var shortage = Assert.Single(shortages);
        Assert.Equal((Sugar, 1.5m, 1m), (shortage.ItemId, shortage.Needed, shortage.Free));
    }

    [Fact]
    public void Physical_counts_are_exempt_from_reservations()
    {
        Assert.False(StockReservationRules.Applies(MovementType.PhysicalCountAdjustment));
        Assert.True(StockReservationRules.Applies(MovementType.TransferOut));
        Assert.True(StockReservationRules.Applies(MovementType.Adjustment));
    }

    [Fact]
    public void A_reservation_needs_a_positive_quantity() =>
        Assert.Equal("invalid_quantity", Code(() => new StockReservation(RawMaterials, Flour, 0, Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow)));

    [Fact]
    public void Only_a_sub_warehouse_supplies_production_by_default()
    {
        var plant = new Location("PLANTA", "Planta", LocationType.Plant);
        var raw = Location.Warehouse("PLANTA-MP", "Materias primas", plant);
        raw.SetSuppliesTypes([ItemType.RawMaterial, ItemType.RawMaterial]);
        Assert.Equal(["RawMaterial"], raw.SuppliesTypes);
        Assert.True(raw.Supplies(ItemType.RawMaterial));
        Assert.False(raw.Supplies(ItemType.Supply));

        var factory = Location.Factory("PLANTA-FAB", "Fábrica", plant);
        Assert.Equal("supplies_not_warehouse", Code(() => factory.SetSuppliesTypes([ItemType.RawMaterial])));
        Assert.Equal("supplies_not_warehouse", Code(() => plant.SetSuppliesTypes([ItemType.Supply])));
    }

    [Fact]
    public void A_draft_takes_the_default_origin_for_lines_without_one()
    {
        var recipe = new Recipe(Guid.NewGuid(), 1, 100, null, [new RecipeLineInput(Flour, 5, 0), new RecipeLineInput(Sugar, 1, 0)]);
        var other = Guid.NewGuid();
        var order = new ProductionOrder("OP-000001", Guid.NewGuid(),
            new ProductionOrderPlan(recipe, 200, new DateOnly(2026, 10, 20), null, null, null, new Dictionary<Guid, Guid> { [Sugar] = other }),
            ProductionOrderSource.Manual, null, new DateOnly(2026, 10, 19));

        order.AssignMissingSources(component => component == Flour ? RawMaterials : null);

        Assert.Equal(RawMaterials, order.Lines.Single(l => l.ComponentItemId == Flour).SourceLocationId);
        Assert.Equal(other, order.Lines.Single(l => l.ComponentItemId == Sugar).SourceLocationId);
        order.Release(DateTimeOffset.UtcNow, null);
        Assert.Equal("production_order_not_draft", Code(() => order.AssignMissingSources(_ => RawMaterials)));
    }

    [Fact]
    public void An_ingredients_voucher_is_not_edited()
    {
        var orderId = Guid.NewGuid();
        var voucher = Transfer.ForProductionOrder("VI-000001", RawMaterials, Guid.NewGuid(), orderId, "OP-000001",
            [new TransferLineInput(Flour, null, 10)]);
        Assert.Equal((TransferKind.Internal, orderId, "Ingredientes de la OP-000001"), (voucher.Kind, voucher.ProductionOrderId, voucher.Notes));
        Assert.Equal("transfer_from_production_order",
            Code(() => voucher.UpdateDraft(voucher.ToLocationId, null, [new TransferLineInput(Flour, null, 5)])));
        voucher.Cancel();
        Assert.Equal(TransferStatus.Cancelled, voucher.Status);
    }
}
