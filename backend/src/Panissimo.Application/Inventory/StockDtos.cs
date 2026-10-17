using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Inventory;

public sealed record StockQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public Guid? ItemId { get; init; }
    public Guid? CategoryId { get; init; }
    public ItemType? Type { get; init; }

    /// <summary>RN-07: only rows whose stock is below the configured minimum.</summary>
    public bool BelowMin { get; init; }
}

/// <summary>Stock of an item at a location (all lots), with its min/max and valuation.</summary>
public sealed record StockLevelDto(
    Guid LocationId, string LocationCode, Guid ItemId, string Sku, string ItemName, ItemType ItemType, Guid CategoryId,
    string BaseUomCode, bool TracksLots, decimal OnHand, decimal? MinQty, decimal? MaxQty, decimal AverageCost,
    decimal StockValue, bool BelowMin);

public sealed record LotStockDto(
    Guid? LotId, string? LotNumber, DateOnly? ExpirationDate, decimal Quantity, int? DaysToExpire, bool IsExpired);

public sealed record MovementQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public Guid? ItemId { get; init; }
    public MovementType? Type { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

/// <param name="BalanceAfter">Running stock of the item at the location after this movement; only when filtering by one location and one item.</param>
public sealed record KardexEntryDto(
    Guid Id, DateTimeOffset OccurredAt, DateOnly BusinessDate, Guid LocationId, string LocationCode,
    Guid ItemId, string Sku, string ItemName, string BaseUomCode, Guid? LotId, string? LotNumber, MovementType Type,
    decimal Quantity, decimal UnitCost, decimal TotalCost, string SourceDocType, Guid SourceDocId, string SourceDocFolio,
    Guid? UserId, string? UserName, string? Notes, decimal? BalanceAfter);

public sealed record LowStockAlertDto(
    Guid LocationId, string LocationCode, Guid ItemId, string Sku, string ItemName, string BaseUomCode,
    decimal OnHand, decimal MinQty, decimal MaxQty);

public sealed record ExpiringLotAlertDto(
    Guid LocationId, string LocationCode, Guid ItemId, string Sku, string ItemName, string BaseUomCode, Guid LotId,
    string LotNumber, DateOnly ExpirationDate, decimal Quantity, int DaysToExpire, bool IsExpired);

public sealed record AlertsDto(int ExpiryAlertDays, IReadOnlyList<LowStockAlertDto> LowStock, IReadOnlyList<ExpiringLotAlertDto> ExpiringLots);

/// <summary>Read side of inventory: stock, lots, kardex and alerts, always limited to the caller's locations (RN-40).</summary>
public interface IStockQueries
{
    Task<PagedResult<StockLevelDto>> ListAsync(StockQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<LotStockDto>> LotsAsync(Guid locationId, Guid itemId, CancellationToken ct = default);
    Task<PagedResult<KardexEntryDto>> MovementsAsync(MovementQuery query, CancellationToken ct = default);
    Task<AlertsDto> AlertsAsync(Guid? locationId, CancellationToken ct = default);
}
