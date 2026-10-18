using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Inventory.Traceability;

public interface ITraceabilityService
{
    /// <summary>RN-100..RN-108: the chain of a lot, a purchase order, a production order, a transfer or a shipment.</summary>
    Task<TraceGraphDto> GetGraphAsync(TraceQuery query, CancellationToken ct = default);

    /// <summary>Lots by number, SKU or item name (at most 50).</summary>
    Task<IReadOnlyList<TraceLotLookupDto>> LotsAsync(TraceLotLookupQuery query, CancellationToken ct = default);

    /// <summary>Entry points by folio (OC-, OP-, TR-, RM-) or lot number.</summary>
    Task<IReadOnlyList<TraceSourceDto>> SourcesAsync(string? q, CancellationToken ct = default);
}

public static class TraceSources
{
    /// <summary>RN-100: the default direction of each entry point.</summary>
    public static TraceDirection DefaultDirection(TraceSourceType type) => type switch
    {
        TraceSourceType.PurchaseOrder => TraceDirection.Forward,
        TraceSourceType.CustomerShipment => TraceDirection.Backward,
        _ => TraceDirection.Both,
    };
}

/// <summary>
/// Lot traceability (trazabilidad §5): a query, it saves nothing but its trace in the audit log (RN-109). A quality
/// function that crosses locations: it is not limited to the user's locations.
/// </summary>
public sealed class TraceabilityService(
    IAppDbContext db, ITraceDataSource data, UserAccessContext access, ICurrentUser currentUser, IClock clock) : ITraceabilityService
{
    public const int MaxLookup = 50;

    public async Task<TraceGraphDto> GetGraphAsync(TraceQuery query, CancellationToken ct = default)
    {
        var (source, seeds) = await ResolveAsync(query.SourceType, query.SourceId, ct);
        var direction = query.Direction ?? TraceSources.DefaultDirection(query.SourceType);
        var maxNodes = (int)await db.GetSettingAsync(AppSettingKeys.TraceabilityMaxNodes, ct);
        var options = new TraceBuildOptions(direction, query.MaxDepth, maxNodes, Has(Permissions.ProductionView), Has(Permissions.PurchasingView));
        var asOf = clock.UtcNow;

        TraceGraphDto graph;
        if (seeds.Count == 0)
        {
            graph = new TraceGraphDto(source, direction, asOf, false, [], [TraceWarnings.NoLots], [], [], [], [],
                new TraceSummaryDto([], [], [], [], 0));
        }
        else
        {
            var result = await new TraceGraphBuilder(data).BuildAsync(seeds, options, ct);
            graph = new TraceGraphDto(source, direction, asOf, result.Truncated, result.UnexpandedNodeIds, result.Warnings, result.Nodes,
                result.Edges, result.Groups, result.Events, result.Summary);
        }

        // RN-109: every query leaves its trace.
        db.AuditLogs.Add(new AuditLog(asOf, currentUser.UserId, AuditAction.Queried, "Traceability", query.SourceId.ToString(),
            JsonSerializer.Serialize(new { sourceType = query.SourceType.ToString(), source = source.Label, direction = direction.ToString(),
                nodes = graph.Nodes.Count, truncated = graph.Truncated }),
            currentUser.IpAddress));
        await db.SaveChangesAsync(ct);
        return graph;
    }

    public async Task<IReadOnlyList<TraceLotLookupDto>> LotsAsync(TraceLotLookupQuery query, CancellationToken ct = default)
    {
        var lots = from l in db.Lots.AsNoTracking()
                   join i in db.Items on l.ItemId equals i.Id
                   select new { Lot = l, i.Sku, i.Name };
        if (query.ItemId is { } itemId)
            lots = lots.Where(x => x.Lot.ItemId == itemId);
        if (query.Q?.Trim().ToLower() is { Length: > 0 } term)
            lots = lots.Where(x => x.Lot.LotNumber.ToLower().Contains(term) || x.Sku.ToLower().Contains(term) || x.Name.ToLower().Contains(term));
        return await lots.OrderByDescending(x => x.Lot.CreatedAt).Take(Math.Clamp(query.Limit, 1, MaxLookup))
            .Select(x => new TraceLotLookupDto(x.Lot.Id, x.Lot.LotNumber, x.Lot.ItemId, x.Sku, x.Name, x.Lot.ExpirationDate))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<TraceSourceDto>> SourcesAsync(string? q, CancellationToken ct = default)
    {
        var term = q?.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(term))
            return [];
        const int take = 10;
        var found = new List<TraceSourceDto>();
        bool Wants(string prefix) => term.StartsWith(prefix, StringComparison.Ordinal) || !term.Contains('-');

        if (Wants("OC-"))
            found.AddRange(await (from o in db.PurchaseOrders.AsNoTracking()
                                  join s in db.Suppliers on o.SupplierId equals s.Id
                                  where o.Folio.Contains(term)
                                  orderby o.Folio descending
                                  select new TraceSourceDto(TraceSourceType.PurchaseOrder, o.Id, o.Folio + " · " + s.Name)).Take(take).ToListAsync(ct));
        if (Wants("OP-"))
            found.AddRange(await (from o in db.ProductionOrders.AsNoTracking()
                                  join i in db.Items on o.OutputItemId equals i.Id
                                  where o.Folio.Contains(term)
                                  orderby o.Folio descending
                                  select new TraceSourceDto(TraceSourceType.ProductionOrder, o.Id, o.Folio + " · " + i.Name)).Take(take).ToListAsync(ct));
        if (Wants("TR-"))
            found.AddRange(await (from t in db.Transfers.AsNoTracking()
                                  join f in db.Locations on t.FromLocationId equals f.Id
                                  join d in db.Locations on t.ToLocationId equals d.Id
                                  where t.Kind == TransferKind.Standard && t.Folio.Contains(term)
                                  orderby t.Folio descending
                                  select new TraceSourceDto(TraceSourceType.Transfer, t.Id, t.Folio + " · " + f.Code + " → " + d.Code)).Take(take).ToListAsync(ct));
        if (Wants("RM-"))
            found.AddRange(await (from s in db.CustomerShipments.AsNoTracking()
                                  join c in db.Customers on s.CustomerId equals c.Id
                                  where s.Folio.Contains(term)
                                  orderby s.Folio descending
                                  select new TraceSourceDto(TraceSourceType.CustomerShipment, s.Id, s.Folio + " · " + c.Name)).Take(take).ToListAsync(ct));
        // A lot number can look like a folio (OP-000412-01 is the lot of a close): lots are always searched.
        found.AddRange(await (from l in db.Lots.AsNoTracking()
                              join i in db.Items on l.ItemId equals i.Id
                              where l.LotNumber.ToUpper().Contains(term)
                              orderby l.CreatedAt descending
                              select new TraceSourceDto(TraceSourceType.Lot, l.Id, l.LotNumber + " · " + i.Name)).Take(take).ToListAsync(ct));
        return found;
    }

    private bool Has(string permission) => access.Access?.Has(permission) ?? false;

    /// <summary>RN-100: the entry point becomes its seed lots; 404 when it does not exist.</summary>
    private async Task<(TraceSourceDto Source, IReadOnlyList<Guid> Seeds)> ResolveAsync(TraceSourceType type, Guid id, CancellationToken ct)
    {
        switch (type)
        {
            case TraceSourceType.Lot:
            {
                var lot = await (from l in db.Lots.AsNoTracking()
                                 join i in db.Items on l.ItemId equals i.Id
                                 where l.Id == id
                                 select new { l.LotNumber, i.Name }).SingleOrDefaultAsync(ct)
                          ?? throw new NotFoundException("el lote", id);
                return (new TraceSourceDto(type, id, $"{lot.LotNumber} · {lot.Name}"), [id]);
            }
            case TraceSourceType.PurchaseOrder:
            {
                var order = await (from o in db.PurchaseOrders.AsNoTracking()
                                   join s in db.Suppliers on o.SupplierId equals s.Id
                                   where o.Id == id
                                   select new { o.Folio, s.Name }).SingleOrDefaultAsync(ct)
                            ?? throw new NotFoundException("la orden de compra", id);
                var seeds = await db.GoodsReceipts.AsNoTracking().Where(r => r.PurchaseOrderId == id)
                    .SelectMany(r => r.Lines).Where(l => l.LotId != null).Select(l => l.LotId!.Value).Distinct().ToListAsync(ct);
                return (new TraceSourceDto(type, id, $"{order.Folio} · {order.Name}"), seeds);
            }
            case TraceSourceType.ProductionOrder:
            {
                var order = await (from o in db.ProductionOrders.AsNoTracking()
                                   join i in db.Items on o.OutputItemId equals i.Id
                                   where o.Id == id
                                   select new { o.Folio, i.Name }).SingleOrDefaultAsync(ct)
                            ?? throw new NotFoundException("la orden de producción", id);
                var seeds = await db.ProductionCloses.AsNoTracking().Where(c => c.ProductionOrderId == id && c.OutputLotId != null)
                    .Select(c => c.OutputLotId!.Value).Distinct().ToListAsync(ct);
                return (new TraceSourceDto(type, id, $"{order.Folio} · {order.Name}"), seeds);
            }
            case TraceSourceType.Transfer:
            {
                var transfer = await (from t in db.Transfers.AsNoTracking()
                                      join f in db.Locations on t.FromLocationId equals f.Id
                                      join d in db.Locations on t.ToLocationId equals d.Id
                                      where t.Id == id
                                      select new { t.Folio, t.Status, From = f.Code, To = d.Code }).SingleOrDefaultAsync(ct)
                               ?? throw new NotFoundException("el traspaso", id);
                // A draft has only planned lots: nothing left yet.
                var seeds = transfer.Status is TransferStatus.Draft or TransferStatus.Cancelled
                    ? []
                    : await db.Transfers.AsNoTracking().Where(t => t.Id == id).SelectMany(t => t.Lines)
                        .Where(l => l.LotId != null).Select(l => l.LotId!.Value).Distinct().ToListAsync(ct);
                return (new TraceSourceDto(type, id, $"{transfer.Folio} · {transfer.From} → {transfer.To}"), seeds);
            }
            default:
            {
                var shipment = await (from s in db.CustomerShipments.AsNoTracking()
                                      join c in db.Customers on s.CustomerId equals c.Id
                                      where s.Id == id
                                      select new { s.Folio, s.Status, c.Name }).SingleOrDefaultAsync(ct)
                               ?? throw new NotFoundException("la remisión", id);
                var seeds = shipment.Status == CustomerShipmentStatus.Cancelled
                    ? []
                    : await db.CustomerShipments.AsNoTracking().Where(s => s.Id == id).SelectMany(s => s.Lines).SelectMany(l => l.Lots)
                        .Select(l => l.LotId).Distinct().ToListAsync(ct);
                return (new TraceSourceDto(type, id, $"{shipment.Folio} · {shipment.Name}"), seeds);
            }
        }
    }
}
