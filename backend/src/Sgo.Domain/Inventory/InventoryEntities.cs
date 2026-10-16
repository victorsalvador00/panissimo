using Sgo.Domain.Common;

namespace Sgo.Domain.Inventory;

public enum MovementType
{
    PurchaseReceipt,
    ProductionConsumption,
    ProductionOutput,
    TransferOut,
    TransferIn,
    Adjustment,
    Waste,
    PhysicalCountAdjustment,
    Consumption,
}

public static class MovementTypeRules
{
    /// <summary>Entries from outside the location: they bring their own unit cost (RN-04).</summary>
    public static bool IsExternalEntry(this MovementType type) =>
        type is MovementType.PurchaseReceipt or MovementType.ProductionOutput or MovementType.TransferIn;

    public static bool OnlyEntries(this MovementType type) => type.IsExternalEntry();

    public static bool OnlyExits(this MovementType type) =>
        type is MovementType.ProductionConsumption or MovementType.TransferOut or MovementType.Consumption or MovementType.Waste;

    /// <summary>
    /// RN-05: an expired lot cannot be dispatched, used in production or consumed at a branch;
    /// it is written off with an adjustment, waste or physical count.
    /// </summary>
    public static bool RejectsExpiredLots(this MovementType type) =>
        type is MovementType.TransferOut or MovementType.ProductionConsumption or MovementType.Consumption;
}

/// <summary>A lot of an item (dominio §4.3). The number is unique per item.</summary>
public class Lot : Entity
{
    private Lot() { }

    public Lot(Guid itemId, string lotNumber, DateOnly? expirationDate, string createdFromDocType, Guid createdFromDocId, DateTimeOffset createdAt)
    {
        if (string.IsNullOrWhiteSpace(lotNumber))
            throw new BusinessRuleException("lot_number_required", "El número de lote es obligatorio.");
        ItemId = itemId;
        LotNumber = lotNumber.Trim();
        ExpirationDate = expirationDate;
        CreatedFromDocType = createdFromDocType;
        CreatedFromDocId = createdFromDocId;
        CreatedAt = createdAt;
    }

    public Guid ItemId { get; private set; }
    public string LotNumber { get; private set; } = null!;
    public DateOnly? ExpirationDate { get; private set; }
    public string CreatedFromDocType { get; private set; } = null!;
    public Guid CreatedFromDocId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    public bool IsExpired(DateOnly businessDate) => ExpirationDate < businessDate;
}

/// <summary>
/// On-hand quantity per (location, item, lot). Only <c>IInventoryPostingService</c> changes it (RN-01).
/// </summary>
public class StockBalance : Entity
{
    private StockBalance() { }

    public StockBalance(Guid locationId, Guid itemId, Guid? lotId)
    {
        LocationId = locationId;
        ItemId = itemId;
        LotId = lotId;
    }

    public Guid LocationId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }
    public decimal Quantity { get; private set; }

    internal void Add(decimal quantity) => Quantity += quantity;
}

/// <summary>Current weighted average cost per (location, item) (RN-04).</summary>
public class ItemLocationCost
{
    private ItemLocationCost() { }

    public ItemLocationCost(Guid locationId, Guid itemId)
    {
        LocationId = locationId;
        ItemId = itemId;
    }

    public Guid LocationId { get; private set; }
    public Guid ItemId { get; private set; }
    public decimal AverageCost { get; private set; }

    internal void Set(decimal averageCost) => AverageCost = averageCost;
}

/// <summary>Kardex line. Immutable (RN-01): corrections are new movements.</summary>
public class InventoryMovement : Entity
{
    private InventoryMovement() { }

    /// <param name="ordinal">Position within the posting. EF sorts inserts by primary key, so the id is made
    /// increasing with it: the database sequence (and the kardex) then follows the posting order.</param>
    internal InventoryMovement(
        int ordinal, DateTimeOffset occurredAt, DateOnly businessDate, MovementRequest request, Guid? lotId,
        decimal quantity, decimal unitCost, Guid? userId)
    {
        Id = Guid.CreateVersion7(occurredAt.AddMilliseconds(ordinal));
        OccurredAt = occurredAt;
        BusinessDate = businessDate;
        LocationId = request.LocationId;
        ItemId = request.ItemId;
        LotId = lotId;
        Type = request.Type;
        Quantity = quantity;
        UnitCost = unitCost;
        TotalCost = InventoryMath.Round(quantity * unitCost);
        SourceDocType = request.SourceDocType;
        SourceDocId = request.SourceDocId;
        SourceDocFolio = request.SourceDocFolio;
        UserId = userId;
        Notes = request.Notes;
    }

    /// <summary>Database-assigned insertion order; the kardex and its running balance follow it.</summary>
    public long Sequence { get; private set; }

    public DateTimeOffset OccurredAt { get; private set; }
    public DateOnly BusinessDate { get; private set; }
    public Guid LocationId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }
    public MovementType Type { get; private set; }

    /// <summary>Signed, in base unit: + entry, − exit.</summary>
    public decimal Quantity { get; private set; }

    public decimal UnitCost { get; private set; }
    public decimal TotalCost { get; private set; }
    public string SourceDocType { get; private set; } = null!;
    public Guid SourceDocId { get; private set; }
    public string SourceDocFolio { get; private set; } = null!;
    public Guid? UserId { get; private set; }
    public string? Notes { get; private set; }
}

/// <summary>A request to move inventory (backend spec §5).</summary>
/// <param name="Quantity">Signed, in base unit.</param>
/// <param name="UnitCost">Required for external entries; null = current average cost.</param>
public sealed record MovementRequest(
    Guid LocationId, Guid ItemId, Guid? LotId, MovementType Type,
    decimal Quantity,
    decimal? UnitCost,
    string SourceDocType, Guid SourceDocId, string SourceDocFolio, string? Notes);
