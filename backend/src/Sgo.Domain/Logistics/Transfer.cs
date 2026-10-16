using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;

namespace Sgo.Domain.Logistics;

public enum TransferStatus
{
    Draft,
    Dispatched,
    Received,
    ReceivedWithDiscrepancies,
    Cancelled,
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
    /// The usual route: factory or commissary supplying a branch. Anything else (between branches,
    /// factory ↔ commissary, returns) requires <c>logistics.transfers.special</c> (decisión abierta 4).
    /// </summary>
    public static bool IsStandard(LocationType from, LocationType to) =>
        from is LocationType.Factory or LocationType.Commissary && to == LocationType.Branch;
}

/// <param name="LotId">Optional lot chosen when planning; null = FEFO at dispatch.</param>
public sealed record TransferLineInput(Guid ItemId, Guid? LotId, decimal Quantity);

public sealed record LotQuantity(Guid LotId, decimal Quantity);

public sealed record ReceiptInput(Guid LineId, decimal ReceivedQty, DiscrepancyReason? Reason, string? Notes);

/// <summary>
/// Transfer with shipping data (dominio §4.5): Draft → Dispatched → Received | ReceivedWithDiscrepancies;
/// Cancelled only from Draft (RN-23).
/// </summary>
[Audited]
public class Transfer : AuditableEntity, IVersioned
{
    public const string DocType = "Transfer";

    private readonly List<TransferLine> _lines = [];

    private Transfer() { }

    public Transfer(string folio, Guid fromLocationId, Guid toLocationId, Guid? branchOrderId, string? notes, IReadOnlyList<TransferLineInput> lines)
    {
        Folio = folio;
        FromLocationId = fromLocationId;
        BranchOrderId = branchOrderId;
        Status = TransferStatus.Draft;
        SetPlan(toLocationId, notes, lines);
    }

    public string Folio { get; private set; } = null!;
    public Guid FromLocationId { get; private set; }
    public Guid ToLocationId { get; private set; }
    public Guid? BranchOrderId { get; private set; }
    public TransferStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public string? VehicleDescription { get; private set; }
    public string? DriverName { get; private set; }
    public DateTimeOffset? DispatchedAt { get; private set; }
    public Guid? DispatchedBy { get; private set; }
    public DateTimeOffset? ReceivedAt { get; private set; }
    public Guid? ReceivedBy { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<TransferLine> Lines => _lines;

    public bool IsInTransit => Status == TransferStatus.Dispatched;

    public void UpdateDraft(Guid toLocationId, string? notes, IReadOnlyList<TransferLineInput> lines)
    {
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
    public IReadOnlyList<MovementRequest> DispatchRequests(IReadOnlyDictionary<Guid, IReadOnlyList<LotQuantity>> chosenLots)
    {
        EnsureDraft("Solo un traspaso en borrador puede despacharse.");
        if (chosenLots.Keys.Any(id => _lines.All(l => l.Id != id)))
            throw new BusinessRuleException("transfer_line_not_found", "Una línea indicada no pertenece al traspaso.");

        var requests = new List<MovementRequest>();
        foreach (var line in _lines)
        {
            if (chosenLots.TryGetValue(line.Id, out var lots) && lots.Count > 0)
            {
                if (lots.Sum(l => l.Quantity) != line.ShippedQty || lots.Any(l => l.Quantity <= 0))
                    throw new BusinessRuleException("transfer_lots_mismatch",
                        "La suma de los lotes elegidos debe ser igual a la cantidad de la línea.");
                requests.AddRange(lots.Select(l => Out(line.ItemId, l.LotId, l.Quantity)));
            }
            else
            {
                requests.Add(Out(line.ItemId, line.LotId, line.ShippedQty));
            }
        }
        return requests;

        MovementRequest Out(Guid itemId, Guid? lotId, decimal qty) =>
            new(FromLocationId, itemId, lotId, MovementType.TransferOut, -qty, null, DocType, Id, Folio, $"Traspaso {Folio}");
    }

    /// <summary>Records the shipment: lines become one per lot actually taken, with the origin's cost.</summary>
    public void Dispatch(string vehicleDescription, string driverName, DateTimeOffset now, Guid? userId, IReadOnlyList<InventoryMovement> movementsOut)
    {
        EnsureDraft("Solo un traspaso en borrador puede despacharse.");
        if (string.IsNullOrWhiteSpace(vehicleDescription) || string.IsNullOrWhiteSpace(driverName))
            throw new BusinessRuleException("transfer_shipping_required", "Indica el vehículo y el chofer del despacho.");
        if (movementsOut.Count == 0 || movementsOut.Any(m => m.Type != MovementType.TransferOut || m.SourceDocId != Id))
            throw new ArgumentException("Dispatch needs the TransferOut movements of this transfer.", nameof(movementsOut));

        _lines.Clear();
        foreach (var m in movementsOut)
            _lines.Add(TransferLine.Shipped(Id, m.ItemId, m.LotId, -m.Quantity, m.UnitCost));

        VehicleDescription = vehicleDescription.Trim();
        DriverName = driverName.Trim();
        DispatchedAt = now;
        DispatchedBy = userId;
        Status = TransferStatus.Dispatched;
    }

    /// <summary>
    /// RN-22: every line is received at once; received ≤ shipped; a shortfall needs a reason and leaves the
    /// transfer ReceivedWithDiscrepancies. Returns the TransferIn requests (same lot and cost as the origin, RN-04).
    /// </summary>
    public IReadOnlyList<MovementRequest> Receive(IReadOnlyList<ReceiptInput> receipts, DateTimeOffset now, Guid? userId)
    {
        if (Status != TransferStatus.Dispatched)
            throw new BusinessRuleException("transfer_not_in_transit", "Solo un traspaso despachado (en tránsito) puede recibirse.");
        if (receipts.Select(r => r.LineId).Distinct().Count() != receipts.Count
            || receipts.Count != _lines.Count
            || receipts.Any(r => _lines.All(l => l.Id != r.LineId)))
            throw new BusinessRuleException("transfer_receipt_incomplete", "Captura la cantidad recibida de todas las líneas del traspaso.");

        foreach (var receipt in receipts)
            _lines.Single(l => l.Id == receipt.LineId).Receive(receipt);

        ReceivedAt = now;
        ReceivedBy = userId;
        Status = _lines.Any(l => l.ShortQty > 0) ? TransferStatus.ReceivedWithDiscrepancies : TransferStatus.Received;

        return _lines.Where(l => l.ReceivedQty > 0)
            .Select(l => new MovementRequest(ToLocationId, l.ItemId, l.LotId, MovementType.TransferIn, l.ReceivedQty!.Value,
                l.UnitCost, DocType, Id, Folio, $"Traspaso {Folio}"))
            .ToList();
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

    internal static TransferLine Shipped(Guid transferId, Guid itemId, Guid? lotId, decimal quantity, decimal unitCost) =>
        new() { TransferId = transferId, ItemId = itemId, LotId = lotId, ShippedQty = quantity, UnitCost = unitCost };

    public Guid TransferId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }

    /// <summary>Planned quantity while in draft; shipped quantity once dispatched (base unit).</summary>
    public decimal ShippedQty { get; private set; }

    public decimal? ReceivedQty { get; private set; }

    /// <summary>Origin's average cost at dispatch; the destination receives at this cost (RN-04).</summary>
    public decimal? UnitCost { get; private set; }

    public DiscrepancyReason? DiscrepancyReason { get; private set; }
    public string? DiscrepancyNotes { get; private set; }

    /// <summary>Loss in transit (RN-22).</summary>
    public decimal ShortQty => ReceivedQty is { } received ? ShippedQty - received : 0;

    internal void Receive(ReceiptInput receipt)
    {
        if (receipt.ReceivedQty < 0 || InventoryMath.Round(receipt.ReceivedQty) != receipt.ReceivedQty)
            throw new BusinessRuleException("invalid_quantity", "La cantidad recibida no puede ser negativa y admite máximo 4 decimales.");
        if (receipt.ReceivedQty > ShippedQty)
            throw new BusinessRuleException("transfer_over_receipt", "No se puede recibir más de lo enviado (RN-22).");
        if (receipt.ReceivedQty < ShippedQty && receipt.Reason is null)
            throw new BusinessRuleException("transfer_discrepancy_reason_required",
                "Si recibes menos de lo enviado, indica el motivo de la diferencia (RN-22).");

        ReceivedQty = receipt.ReceivedQty;
        DiscrepancyReason = receipt.ReceivedQty < ShippedQty ? receipt.Reason : null;
        DiscrepancyNotes = receipt.ReceivedQty < ShippedQty && !string.IsNullOrWhiteSpace(receipt.Notes) ? receipt.Notes.Trim() : null;
    }
}
