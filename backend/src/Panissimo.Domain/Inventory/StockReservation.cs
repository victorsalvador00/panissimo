using Panissimo.Domain.Common;

namespace Panissimo.Domain.Inventory;

/// <summary>
/// RN-50a: stock held at a sub-warehouse for the ingredients voucher of a released production order. No other exit
/// may leave the (location, item) below what is reserved; the voucher's dispatch (or its cancellation) releases it.
/// </summary>
public class StockReservation : Entity
{
    private StockReservation() { }

    public StockReservation(Guid locationId, Guid itemId, decimal quantity, Guid productionOrderId, Guid transferId, DateTimeOffset createdAt)
    {
        if (quantity <= 0 || InventoryMath.Round(quantity) != quantity)
            throw new BusinessRuleException("invalid_quantity", "La cantidad reservada debe ser mayor que cero, con máximo 4 decimales.");
        LocationId = locationId;
        ItemId = itemId;
        Quantity = quantity;
        ProductionOrderId = productionOrderId;
        TransferId = transferId;
        CreatedAt = createdAt;
    }

    public Guid LocationId { get; private set; }
    public Guid ItemId { get; private set; }
    public decimal Quantity { get; private set; }
    public Guid ProductionOrderId { get; private set; }

    /// <summary>The ingredients voucher that will take it out.</summary>
    public Guid TransferId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
}

/// <param name="Available">Stock left after the exits of the operation.</param>
public sealed record ReservedShortage(Guid LocationId, Guid ItemId, string Sku, decimal Reserved, decimal Available);

public static class StockReservationRules
{
    /// <summary>RN-50a: free stock = usable stock − reserved; never below zero.</summary>
    public static decimal Free(decimal usable, decimal reserved) => Math.Max(0, usable - reserved);

    /// <summary>
    /// RN-50a: an operation with exits may not leave a (location, item) below its reservations. Physical counts are
    /// exempt: they record what is really there.
    /// </summary>
    public static bool Applies(MovementType type) => type != MovementType.PhysicalCountAdjustment;

    /// <summary>RN-50a: what a release asks for at each (location, item) beyond its free stock.</summary>
    public static IReadOnlyList<(Guid LocationId, Guid ItemId, decimal Needed, decimal Free)> Shortages(
        IEnumerable<(Guid LocationId, Guid ItemId, decimal Needed)> needs, Func<Guid, Guid, decimal> free) =>
        needs.GroupBy(n => (n.LocationId, n.ItemId))
            .Select(g => (g.Key.LocationId, g.Key.ItemId, Needed: g.Sum(n => n.Needed), Free: free(g.Key.LocationId, g.Key.ItemId)))
            .Where(x => x.Needed > x.Free)
            .ToList();

    public static string Message(IReadOnlyList<ReservedShortage> shortages, Func<Guid, string> locationCode) =>
        "La existencia está reservada para vales de producción (RN-50a): " + string.Join("; ", shortages.Select(s =>
            $"{s.Sku} en {locationCode(s.LocationId)} quedaría en {s.Available:0.####} y hay {s.Reserved:0.####} reservado"))
        + ". Envía o cancela esos vales, o usa otro subalmacén.";
}
