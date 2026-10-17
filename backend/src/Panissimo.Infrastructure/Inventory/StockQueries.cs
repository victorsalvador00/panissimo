using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Infrastructure.Persistence;

namespace Panissimo.Infrastructure.Inventory;

/// <summary>Read side of inventory: stock, lots, kardex and alerts, always limited to the caller's locations (RN-40).</summary>
public sealed class StockQueries(AppDbContext db, ILocationScope scope, IClock clock, IUserDirectory userDirectory) : IStockQueries
{
    private sealed class StockRow
    {
        public Guid LocationId { get; init; }
        public string LocationCode { get; init; } = "";
        public Guid ItemId { get; init; }
        public string Sku { get; init; } = "";
        public string ItemName { get; init; } = "";
        public ItemType ItemType { get; init; }
        public Guid CategoryId { get; init; }
        public string BaseUomCode { get; init; } = "";
        public bool TracksLots { get; init; }
        public decimal OnHand { get; init; }
        public decimal? MinQty { get; init; }
        public decimal? MaxQty { get; init; }
        public decimal AverageCost { get; init; }

        /// <summary>Σ quantity × average cost of each stock location (RN-46: a parent row adds its sub-warehouses).</summary>
        public decimal Value { get; init; }
    }

    private sealed class KardexRow
    {
        public required InventoryMovement Movement { get; init; }
        public required string LocationCode { get; init; }
        public required string Sku { get; init; }
        public required string ItemName { get; init; }
        public required string BaseUomCode { get; init; }
        public string? LotNumber { get; init; }
    }

    private static readonly Dictionary<string, Expression<Func<StockRow, object?>>> StockSort = new()
    {
        ["sku"] = r => r.Sku,
        ["itemName"] = r => r.ItemName,
        ["location"] = r => r.LocationCode,
        ["onHand"] = r => r.OnHand,
    };

    /// <summary>
    /// RN-46: the stock locations to read. A plant or branch with sub-warehouses stands for those the caller may see;
    /// without a filter, every stock location in scope (RN-40, B-26).
    /// </summary>
    private async Task<List<Guid>> StockLocationsAsync(Guid? locationId, CancellationToken ct)
    {
        var allowed = scope.AllowedStockLocationIds;
        if (locationId is not { } id)
            return [.. allowed];

        scope.EnsureAccess(id);
        var warehouses = await db.Locations.AsNoTracking().Where(l => l.ParentLocationId == id).Select(l => l.Id).ToListAsync(ct);
        var result = warehouses.Prepend(id).Where(allowed.Contains).ToList();
        if (result.Count == 0)
            scope.EnsureStockAccess(id);
        return result;
    }

    public async Task<PagedResult<StockLevelDto>> ListAsync(StockQuery query, CancellationToken ct = default)
    {
        var locations = await StockLocationsAsync(query.LocationId, ct);

        // Every (location, item) with a balance row or a min/max setting: an item configured with a minimum
        // but never received must still show up as "below minimum".
        var keys = db.StockBalances.Where(b => locations.Contains(b.LocationId)).Select(b => new { b.LocationId, b.ItemId })
            .Union(db.ItemLocationSettings.Where(s => locations.Contains(s.LocationId)).Select(s => new { s.LocationId, s.ItemId }));
        if (query.ItemId is { } itemId)
            keys = keys.Where(k => k.ItemId == itemId);

        var rows = from k in keys
                   join i in db.Items on k.ItemId equals i.Id
                   join l in db.Locations on k.LocationId equals l.Id
                   join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                   select new StockRow
                   {
                       LocationId = k.LocationId,
                       LocationCode = l.Code,
                       ItemId = i.Id,
                       Sku = i.Sku,
                       ItemName = i.Name,
                       ItemType = i.Type,
                       CategoryId = i.CategoryId,
                       BaseUomCode = u.Code,
                       TracksLots = i.TracksLots,
                       // RN-46: own stock plus that of its sub-warehouses (min/max live on the plant or branch).
                       OnHand = db.StockBalances.Where(b => b.ItemId == k.ItemId && (b.LocationId == k.LocationId
                               || db.Locations.Any(w => w.Id == b.LocationId && w.ParentLocationId == k.LocationId)))
                           .Sum(b => b.Quantity),
                       Value = db.StockBalances.Where(b => b.ItemId == k.ItemId && (b.LocationId == k.LocationId
                               || db.Locations.Any(w => w.Id == b.LocationId && w.ParentLocationId == k.LocationId)))
                           .Sum(b => b.Quantity * db.ItemLocationCosts.Where(c => c.LocationId == b.LocationId && c.ItemId == b.ItemId)
                               .Select(c => c.AverageCost).FirstOrDefault()),
                       MinQty = db.ItemLocationSettings.Where(s => s.LocationId == k.LocationId && s.ItemId == k.ItemId).Select(s => (decimal?)s.MinQty).FirstOrDefault(),
                       MaxQty = db.ItemLocationSettings.Where(s => s.LocationId == k.LocationId && s.ItemId == k.ItemId).Select(s => (decimal?)s.MaxQty).FirstOrDefault(),
                       AverageCost = db.ItemLocationCosts.Where(c => c.LocationId == k.LocationId && c.ItemId == k.ItemId).Select(c => c.AverageCost).FirstOrDefault(),
                   };

        if (query.CategoryId is { } categoryId)
            rows = rows.Where(r => r.CategoryId == categoryId);
        if (query.Type is { } type)
            rows = rows.Where(r => r.ItemType == type);
        if (query.SearchTerm() is { } term)
            rows = rows.Where(r => r.Sku.ToLower().Contains(term) || r.ItemName.ToLower().Contains(term));
        if (query.BelowMin)
            rows = rows.Where(r => r.MinQty != null && r.OnHand < r.MinQty);

        return await rows.ApplySort(query.Sort, StockSort, "sku").ToPagedResultAsync(query, r => new StockLevelDto(
            r.LocationId, r.LocationCode, r.ItemId, r.Sku, r.ItemName, r.ItemType, r.CategoryId, r.BaseUomCode, r.TracksLots,
            r.OnHand, r.MinQty, r.MaxQty, r.OnHand != 0 ? decimal.Round(r.Value / r.OnHand, 4) : r.AverageCost, decimal.Round(r.Value, 2),
            r.MinQty is { } min && r.OnHand < min), ct);
    }

    public async Task<IReadOnlyList<LotStockDto>> LotsAsync(Guid locationId, Guid itemId, CancellationToken ct = default)
    {
        var locations = await StockLocationsAsync(locationId, ct);
        var today = clock.BusinessDate();

        var rows = await (from b in db.StockBalances.AsNoTracking()
                          where locations.Contains(b.LocationId) && b.ItemId == itemId && b.Quantity != 0
                          join l in db.Lots on b.LotId equals l.Id into lots
                          from l in lots.DefaultIfEmpty()
                          select new { b.LotId, LotNumber = l == null ? null : l.LotNumber, ExpirationDate = l == null ? null : l.ExpirationDate, b.Quantity })
            .ToListAsync(ct);

        return rows
            .Select(r => new LotStockDto(r.LotId, r.LotNumber, r.ExpirationDate, r.Quantity,
                r.ExpirationDate is { } exp ? exp.DayNumber - today.DayNumber : null, r.ExpirationDate < today))
            .OrderBy(r => r.ExpirationDate is null).ThenBy(r => r.ExpirationDate).ThenBy(r => r.LotNumber)
            .ToList();
    }

    public async Task<PagedResult<KardexEntryDto>> MovementsAsync(MovementQuery query, CancellationToken ct = default)
    {
        var locations = await StockLocationsAsync(query.LocationId, ct);
        var movements = db.InventoryMovements.AsNoTracking().Where(m => locations.Contains(m.LocationId));
        if (query.ItemId is { } itemId)
            movements = movements.Where(m => m.ItemId == itemId);
        if (query.Type is { } type)
            movements = movements.Where(m => m.Type == type);
        if (query.From is { } from)
            movements = movements.Where(m => m.OccurredAt >= from);
        if (query.To is { } to)
            movements = movements.Where(m => m.OccurredAt <= to);
        if (query.SearchTerm() is { } term)
            movements = movements.Where(m => m.SourceDocFolio.ToLower().Contains(term));

        var rows = from m in movements
                   join l in db.Locations on m.LocationId equals l.Id
                   join i in db.Items on m.ItemId equals i.Id
                   join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                   join lot in db.Lots on m.LotId equals lot.Id into lots
                   from lot in lots.DefaultIfEmpty()
                   orderby m.Sequence descending
                   select new KardexRow
                   {
                       Movement = m,
                       LocationCode = l.Code,
                       Sku = i.Sku,
                       ItemName = i.Name,
                       BaseUomCode = u.Code,
                       LotNumber = lot == null ? null : lot.LotNumber,
                   };

        var page = await rows.ToPagedResultAsync(query, ct);

        // Running balance, as a kardex is read, when looking at one item in one location.
        var balances = new Dictionary<Guid, decimal>();
        if (query.LocationId is not null && query.ItemId is { } oneItem && page.Items.Count > 0)
            balances = await RunningBalancesAsync(locations, oneItem, page.Items.Select(r => r.Movement).ToList(), ct);
        // Looked up for the page only: a join would change the plan of the kardex query.
        var users = await userDirectory.GetNamesAsync(page.Items.Select(r => r.Movement.UserId), ct);

        return new PagedResult<KardexEntryDto>(page.Items.Select(r =>
        {
            var m = r.Movement;
            return new KardexEntryDto(m.Id, m.OccurredAt, m.BusinessDate, m.LocationId, r.LocationCode, m.ItemId, r.Sku, r.ItemName,
                r.BaseUomCode, m.LotId, r.LotNumber, m.Type, m.Quantity, m.UnitCost, m.TotalCost, m.SourceDocType, m.SourceDocId,
                m.SourceDocFolio, m.UserId, users.Of(m.UserId), m.Notes, balances.TryGetValue(m.Id, out var balance) ? balance : null);
        }).ToList(), page.Page, page.PageSize, page.Total);
    }

    /// <summary>
    /// The balance after the newest movement of the page is one SUM over the covering index
    /// (location_id, item_id, sequence) INCLUDE (quantity); older rows subtract only the movements inside the page's
    /// sequence range, so the cost does not grow with the item's history.
    /// </summary>
    private async Task<Dictionary<Guid, decimal>> RunningBalancesAsync(
        IReadOnlyList<Guid> locationIds, Guid itemId, IReadOnlyList<InventoryMovement> page, CancellationToken ct)
    {
        var newest = page.Max(m => m.Sequence);
        var oldest = page.Min(m => m.Sequence);
        var history = db.InventoryMovements.AsNoTracking().Where(m => locationIds.Contains(m.LocationId) && m.ItemId == itemId);

        var balance = await history.Where(m => m.Sequence <= newest).SumAsync(m => m.Quantity, ct);
        var inRange = await history.Where(m => m.Sequence > oldest && m.Sequence <= newest)
            .OrderByDescending(m => m.Sequence).Select(m => new { m.Sequence, m.Quantity }).ToListAsync(ct);

        var bySequence = new Dictionary<long, decimal>();
        foreach (var movement in inRange)
        {
            bySequence[movement.Sequence] = balance;
            balance -= movement.Quantity;
        }
        bySequence[oldest] = balance;
        return page.ToDictionary(m => m.Id, m => bySequence[m.Sequence]);
    }

    public async Task<AlertsDto> AlertsAsync(Guid? locationId, CancellationToken ct = default)
    {
        var locations = await StockLocationsAsync(locationId, ct);
        var today = clock.BusinessDate();
        var days = (int)await db.GetSettingAsync(AppSettingKeys.ExpiryAlertDays, ct);
        var limit = today.AddDays(days);

        var lowStock = await (from s in db.ItemLocationSettings.AsNoTracking()
                              where locations.Contains(s.LocationId)
                              join i in db.Items on s.ItemId equals i.Id
                              join l in db.Locations on s.LocationId equals l.Id
                              join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                              where i.IsActive && l.IsActive
                              let onHand = db.StockBalances.Where(b => b.ItemId == s.ItemId && (b.LocationId == s.LocationId
                                      || db.Locations.Any(w => w.Id == b.LocationId && w.ParentLocationId == s.LocationId)))
                                  .Sum(b => b.Quantity)
                              where onHand < s.MinQty
                              orderby l.Code, i.Sku
                              select new LowStockAlertDto(l.Id, l.Code, i.Id, i.Sku, i.Name, u.Code, onHand, s.MinQty, s.MaxQty))
            .ToListAsync(ct);

        var expiring = await (from b in db.StockBalances.AsNoTracking()
                              where locations.Contains(b.LocationId) && b.Quantity > 0
                              join lot in db.Lots on b.LotId equals lot.Id
                              where lot.ExpirationDate != null && lot.ExpirationDate <= limit
                              join i in db.Items on b.ItemId equals i.Id
                              join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                              join l in db.Locations on b.LocationId equals l.Id
                              where l.IsActive
                              orderby lot.ExpirationDate, l.Code, i.Sku
                              select new { l.Id, l.Code, ItemId = i.Id, i.Sku, i.Name, Uom = u.Code, LotId = lot.Id, lot.LotNumber, Expiration = lot.ExpirationDate!.Value, b.Quantity })
            .ToListAsync(ct);

        return new AlertsDto(days, lowStock, expiring.Select(e => new ExpiringLotAlertDto(e.Id, e.Code, e.ItemId, e.Sku, e.Name,
            e.Uom, e.LotId, e.LotNumber, e.Expiration, e.Quantity, e.Expiration.DayNumber - today.DayNumber, e.Expiration < today)).ToList());
    }
}
