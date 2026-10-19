using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;

namespace Panissimo.Domain.Logistics;

public enum TransferStatus
{
    Draft,
    Dispatched,
    Received,
    ReceivedWithDiscrepancies,
    Cancelled,
}

/// <summary>Standard: plant ⇄ branches (RN-25). Internal: voucher between sub-warehouses of one location (RN-47).</summary>
public enum TransferKind
{
    Standard,
    Internal,
}

public enum DiscrepancyReason
{
    Missing,
    Damaged,
    Other,
}

public static class TransferRoutes
{
    /// <summary>
    /// RN-25: the usual route is the plant supplying a branch. Branch → branch and branch → plant (returns) require
    /// <c>logistics.transfers.special</c>.
    /// </summary>
    public static bool IsStandard(LocationType from, LocationType to) => from == LocationType.Plant && to == LocationType.Branch;

    /// <summary>
    /// RN-115: a transfer between locations (any route) carries finished goods, bulk or packaged, and supplies; never
    /// raw materials or semi-finished goods. Internal vouchers (RN-47, RN-112) are not bound by it.
    /// </summary>
    public static bool IsShippable(ItemType type) => type is ItemType.FinishedGood or ItemType.Supply;
}

/// <param name="LotId">Optional lot chosen when planning; null = FEFO at dispatch.</param>
public sealed record TransferLineInput(Guid ItemId, Guid? LotId, decimal Quantity);

/// <summary>A quantity taken from one lot (manual lot split at dispatch, shipment or production close).</summary>
public sealed record LotQuantity(Guid LotId, decimal Qty);

/// <param name="Reason">RN-22: why something did not arrive (the shortfall, shipped − received − rejected).</param>
/// <param name="Rejection">RN-116: what arrived and the branch refused; only on a transfer, not on an internal voucher.</param>
public sealed record ReceiptInput(Guid LineId, decimal ReceivedQty, DiscrepancyReason? Reason, string? Notes,
    TransferRejectionInput? Rejection = null);

/// <summary>RN-116: the same reasons and dispositions as a customer's rejection (RN-114).</summary>
public sealed record TransferRejectionInput(decimal Quantity, ShipmentRejectionReason Reason, string? Notes, RejectionDisposition Disposition);

/// <summary>
/// Transfer with shipping data (dominio §4.5): Draft → Dispatched → Received | ReceivedWithDiscrepancies;
/// Cancelled only from Draft (RN-23).
/// </summary>
[Audited]
public class Transfer : AuditableEntity, IVersioned
{
    public const string DocType = "Transfer";
    public const string InternalDocType = "InternalTransfer";

    private readonly List<TransferLine> _lines = [];

    private Transfer() { }

    public Transfer(string folio, Guid fromLocationId, Guid toLocationId, Guid? branchOrderId, string? notes, IReadOnlyList<TransferLineInput> lines,
        TransferKind kind = TransferKind.Standard)
    {
        if (kind == TransferKind.Internal && branchOrderId is not null)
            throw new ArgumentException("An internal voucher never serves a branch order.", nameof(branchOrderId));
        Folio = folio;
        Kind = kind;
        FromLocationId = fromLocationId;
        BranchOrderId = branchOrderId;
        Status = TransferStatus.Draft;
        SetPlan(toLocationId, notes, lines);
    }

    public string Folio { get; private set; } = null!;
    public TransferKind Kind { get; private set; }

    /// <summary>Source document type of its movements in the kardex.</summary>
    public string SourceDocType => Kind == TransferKind.Internal ? InternalDocType : DocType;

    private string Label => Kind == TransferKind.Internal ? $"Vale {Folio}" : $"Traspaso {Folio}";

    public Guid FromLocationId { get; private set; }
    public Guid ToLocationId { get; private set; }
    public Guid? BranchOrderId { get; private set; }

    /// <summary>RN-112: the production order whose ingredients this internal voucher brings to the factory.</summary>
    public Guid? ProductionOrderId { get; private set; }

    public TransferStatus Status { get; private set; }
    public string? Notes { get; private set; }
    /// <summary>RN-113: the vehicle and driver of the catalog; the text fields keep their copy at dispatch.</summary>
    public Guid? VehicleId { get; private set; }

    public Guid? DriverId { get; private set; }
    public string? VehicleDescription { get; private set; }
    public string? DriverName { get; private set; }
    public DateTimeOffset? DispatchedAt { get; private set; }
    public Guid? DispatchedBy { get; private set; }
    public DateTimeOffset? ReceivedAt { get; private set; }
    public Guid? ReceivedBy { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<TransferLine> Lines => _lines;

    /// <summary>RN-112: an ingredients voucher generated when the order is released.</summary>
    public static Transfer ForProductionOrder(string folio, Guid fromWarehouseId, Guid factoryId, Guid productionOrderId, string orderFolio,
        IReadOnlyList<TransferLineInput> lines) =>
        new(folio, fromWarehouseId, factoryId, null, $"Ingredientes de la {orderFolio}", lines, TransferKind.Internal)
        {
            ProductionOrderId = productionOrderId,
        };

    public void UpdateDraft(Guid toLocationId, string? notes, IReadOnlyList<TransferLineInput> lines)
    {
        if (ProductionOrderId is not null)
            throw new BusinessRuleException("transfer_from_production_order",
                $"El {Label} lo generó una orden de producción: no se edita; envíalo o cancélalo (RN-112).");
        EnsureDraft("Solo un traspaso en borrador puede editarse; uno despachado ya no (RN-23).");
        SetPlan(toLocationId, notes, lines);
    }

    public void Cancel()
    {
        EnsureDraft("Solo un traspaso en borrador puede cancelarse; uno despachado ya no (RN-23).");
        Status = TransferStatus.Cancelled;
    }

    /// <summary>
    /// TransferOut requests for the origin (RN-21). A line may be split among lots chosen at dispatch;
    /// otherwise it keeps the lot chosen when planning, or null for FEFO.
    /// </summary>
    /// <param name="sourceOf">RN-45: stock location each line leaves (the origin or one of its sub-warehouses); null = the origin.</param>
    public IReadOnlyList<MovementRequest> DispatchRequests(IReadOnlyDictionary<Guid, IReadOnlyList<LotQuantity>> chosenLots,
        Func<Guid, Guid>? sourceOf = null)
    {
        EnsureDraft("Solo un traspaso en borrador puede despacharse.");
        if (chosenLots.Keys.Any(id => _lines.All(l => l.Id != id)))
            throw new BusinessRuleException("transfer_line_not_found", "Una línea indicada no pertenece al traspaso.");

        var requests = new List<MovementRequest>();
        foreach (var line in _lines)
        {
            if (chosenLots.TryGetValue(line.Id, out var lots) && lots.Count > 0)
            {
                if (lots.Sum(l => l.Qty) != line.ShippedQty || lots.Any(l => l.Qty <= 0))
                    throw new BusinessRuleException("lots_mismatch",
                        "La suma de los lotes elegidos debe ser igual a la cantidad de la línea.");
                requests.AddRange(lots.Select(l => Out(line.Id, line.ItemId, l.LotId, l.Qty)));
            }
            else
            {
                requests.Add(Out(line.Id, line.ItemId, line.LotId, line.ShippedQty));
            }
        }
        return requests;

        MovementRequest Out(Guid lineId, Guid itemId, Guid? lotId, decimal qty) =>
            new(sourceOf?.Invoke(lineId) ?? FromLocationId, itemId, lotId, MovementType.TransferOut, -qty, null, SourceDocType, Id, Folio, Label);
    }

    /// <summary>Records the shipment: lines become one per lot actually taken, with the origin's cost.</summary>
    public void Dispatch(string vehicleDescription, string driverName, DateTimeOffset now, Guid? userId, IReadOnlyList<InventoryMovement> movementsOut)
    {
        EnsureDraft("Solo un traspaso en borrador puede despacharse.");
        // A voucher moves inside one location: it has no vehicle or driver (RN-47).
        if (Kind == TransferKind.Standard && (string.IsNullOrWhiteSpace(vehicleDescription) || string.IsNullOrWhiteSpace(driverName)))
            throw new BusinessRuleException("transfer_shipping_required", "Indica el vehículo y el chofer del despacho.");
        if (movementsOut.Count == 0 || movementsOut.Any(m => m.Type != MovementType.TransferOut || m.SourceDocId != Id))
            throw new ArgumentException("Dispatch needs the TransferOut movements of this transfer.", nameof(movementsOut));

        _lines.Clear();
        foreach (var m in movementsOut)
            _lines.Add(TransferLine.Shipped(Id, m.LocationId, m.ItemId, m.LotId, -m.Quantity, m.UnitCost));

        VehicleDescription = string.IsNullOrWhiteSpace(vehicleDescription) ? null : vehicleDescription.Trim();
        DriverName = string.IsNullOrWhiteSpace(driverName) ? null : driverName.Trim();
        DispatchedAt = now;
        DispatchedBy = userId;
        Status = TransferStatus.Dispatched;
    }

    /// <summary>RN-113: links the dispatch to the fleet catalog (call right after <see cref="Dispatch"/>).</summary>
    public void AssignFleet(Guid vehicleId, Guid driverId)
    {
        VehicleId = vehicleId;
        DriverId = driverId;
    }

    /// <summary>Shipped quantity per item (RN-24 updates the branch order with it).</summary>
    public IReadOnlyDictionary<Guid, decimal> ShippedByItem() =>
        _lines.GroupBy(l => l.ItemId).ToDictionary(g => g.Key, g => g.Sum(l => l.ShippedQty));

    /// <summary>
    /// RN-22: every line is received at once; received ≤ shipped; a shortfall needs a reason and leaves the
    /// transfer ReceivedWithDiscrepancies. RN-116: what arrived may be rejected; it returns to the sub-warehouse it left
    /// or is lost. Returns the TransferIn requests (same lot and cost as the origin, RN-04): what was received at the
    /// destination and what returns at the origin.
    /// </summary>
    /// <param name="targetOf">RN-45: stock location each line enters (the destination or one of its sub-warehouses); null = the destination.</param>
    public IReadOnlyList<MovementRequest> Receive(IReadOnlyList<ReceiptInput> receipts, DateTimeOffset now, Guid? userId,
        Func<Guid, Guid>? targetOf = null)
    {
        if (Status != TransferStatus.Dispatched)
            throw new BusinessRuleException("transfer_not_in_transit", "Solo un traspaso despachado (en tránsito) puede recibirse.");
        if (receipts.Select(r => r.LineId).Distinct().Count() != receipts.Count
            || receipts.Count != _lines.Count
            || receipts.Any(r => _lines.All(l => l.Id != r.LineId)))
            throw new BusinessRuleException("transfer_receipt_incomplete", "Captura la cantidad recibida de todas las líneas del traspaso.");

        if (Kind == TransferKind.Internal && receipts.Any(r => r.Rejection is not null))
            throw new BusinessRuleException("transfer_rejection_not_allowed",
                "Un vale interno no admite rechazos: lo que no se recibe es faltante (RN-47).");
        foreach (var receipt in receipts)
            _lines.Single(l => l.Id == receipt.LineId).Receive(receipt, targetOf?.Invoke(receipt.LineId) ?? ToLocationId);

        ReceivedAt = now;
        ReceivedBy = userId;
        Status = _lines.Any(l => l.ShortQty > 0 || l.RejectedQty > 0) ? TransferStatus.ReceivedWithDiscrepancies : TransferStatus.Received;

        var received = _lines.Where(l => l.ReceivedQty > 0)
            .Select(l => new MovementRequest(l.ToStockLocationId!.Value, l.ItemId, l.LotId, MovementType.TransferIn, l.ReceivedQty!.Value,
                l.UnitCost, SourceDocType, Id, Folio, Label));
        var returned = _lines.Where(l => l.ReturnedQty > 0)
            .Select(l => new MovementRequest(l.FromStockLocationId!.Value, l.ItemId, l.LotId, MovementType.TransferIn, l.ReturnedQty,
                l.UnitCost, SourceDocType, Id, Folio, $"Rechazo del {Label}"));
        return [.. received, .. returned];
    }

    private void SetPlan(Guid toLocationId, string? notes, IReadOnlyList<TransferLineInput> lines)
    {
        if (toLocationId == FromLocationId)
            throw new BusinessRuleException("transfer_same_location", "El origen y el destino deben ser distintos.");
        if (lines.Count == 0)
            throw new BusinessRuleException("transfer_without_lines", "El traspaso debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.GroupBy(l => (l.ItemId, l.LotId)).Any(g => g.Count() > 1))
            throw new BusinessRuleException("transfer_line_duplicated", "Hay artículos repetidos en el traspaso.");

        ToLocationId = toLocationId;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select(l => TransferLine.Planned(Id, l.ItemId, l.LotId, l.Quantity)));
    }

    private void EnsureDraft(string message)
    {
        if (Status != TransferStatus.Draft)
            throw new BusinessRuleException("transfer_not_draft", message);
    }
}

public class TransferLine : Entity
{
    private TransferLine() { }

    internal static TransferLine Planned(Guid transferId, Guid itemId, Guid? lotId, decimal quantity) =>
        new() { TransferId = transferId, ItemId = itemId, LotId = lotId, ShippedQty = quantity };

    internal static TransferLine Shipped(Guid transferId, Guid fromStockLocationId, Guid itemId, Guid? lotId, decimal quantity, decimal unitCost) =>
        new() { TransferId = transferId, FromStockLocationId = fromStockLocationId, ItemId = itemId, LotId = lotId, ShippedQty = quantity, UnitCost = unitCost };

    public Guid TransferId { get; private set; }

    /// <summary>Where it left: the origin or one of its sub-warehouses (RN-45); set on dispatch.</summary>
    public Guid? FromStockLocationId { get; private set; }

    /// <summary>Where it entered: the destination or one of its sub-warehouses (RN-45); set on receipt.</summary>
    public Guid? ToStockLocationId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>Planned lot while in draft (optional); the lot actually shipped once dispatched.</summary>
    public Guid? LotId { get; private set; }

    /// <summary>Planned quantity while in draft; shipped quantity once dispatched (base unit).</summary>
    public decimal ShippedQty { get; private set; }

    public decimal? ReceivedQty { get; private set; }

    /// <summary>Origin's average cost at dispatch; the destination receives at this cost (RN-04).</summary>
    public decimal? UnitCost { get; private set; }

    public DiscrepancyReason? DiscrepancyReason { get; private set; }
    public string? DiscrepancyNotes { get; private set; }

    /// <summary>RN-116: what arrived and the branch refused (0 when nothing was).</summary>
    public decimal RejectedQty { get; private set; }

    public ShipmentRejectionReason? RejectionReason { get; private set; }
    public string? RejectionNotes { get; private set; }

    /// <summary>RN-116: Return re-enters <see cref="FromStockLocationId"/> (same lot and cost); Loss does not move.</summary>
    public RejectionDisposition? RejectionDisposition { get; private set; }

    public decimal ReturnedQty => RejectionDisposition == Sales.RejectionDisposition.Return ? RejectedQty : 0;
    public decimal RejectedLossQty => RejectionDisposition == Sales.RejectionDisposition.Loss ? RejectedQty : 0;

    /// <summary>Loss in transit (RN-22): what did not arrive.</summary>
    public decimal ShortQty => ReceivedQty is { } received ? ShippedQty - received - RejectedQty : 0;

    public const int RejectionNotesMaxLength = 500;

    internal void Receive(ReceiptInput receipt, Guid toStockLocationId)
    {
        if (receipt.ReceivedQty < 0 || InventoryMath.Round(receipt.ReceivedQty) != receipt.ReceivedQty)
            throw new BusinessRuleException("invalid_quantity", "La cantidad recibida no puede ser negativa y admite máximo 4 decimales.");
        var rejection = receipt.Rejection;
        if (rejection is not null)
        {
            if (rejection.Quantity <= 0 || InventoryMath.Round(rejection.Quantity) != rejection.Quantity)
                throw new BusinessRuleException("invalid_quantity", "Lo rechazado debe ser mayor que cero, con máximo 4 decimales.");
            if (rejection.Reason == ShipmentRejectionReason.Other && string.IsNullOrWhiteSpace(rejection.Notes))
                throw new BusinessRuleException("rejection_notes_required", "Un rechazo por \"Otro\" necesita una nota.");
            if (rejection.Notes is { Length: > RejectionNotesMaxLength })
                throw new BusinessRuleException("rejection_notes_too_long", $"La nota admite hasta {RejectionNotesMaxLength} caracteres.");
        }
        var rejected = rejection?.Quantity ?? 0;
        if (receipt.ReceivedQty + rejected > ShippedQty)
            throw new BusinessRuleException("transfer_over_receipt", "Lo recibido más lo rechazado no puede exceder lo enviado (RN-22, RN-116).");
        var missing = ShippedQty - receipt.ReceivedQty - rejected;
        if (missing > 0 && receipt.Reason is null)
            throw new BusinessRuleException("transfer_discrepancy_reason_required",
                "Si no llegó todo lo enviado, indica el motivo del faltante (RN-22).");

        ReceivedQty = receipt.ReceivedQty;
        ToStockLocationId = toStockLocationId;
        DiscrepancyReason = missing > 0 ? receipt.Reason : null;
        DiscrepancyNotes = missing > 0 && !string.IsNullOrWhiteSpace(receipt.Notes) ? receipt.Notes.Trim() : null;
        RejectedQty = rejected;
        RejectionReason = rejection?.Reason;
        RejectionNotes = string.IsNullOrWhiteSpace(rejection?.Notes) ? null : rejection.Notes.Trim();
        RejectionDisposition = rejection?.Disposition;
    }
}
