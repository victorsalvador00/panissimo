using FluentValidation;
using Panissimo.Application.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

/// <param name="LineId">An existing line of the order: keeps its link to the requisition.</param>
/// <param name="Quantity">In purchase unit.</param>
/// <param name="UnitPrice">Without VAT, per purchase unit. Empty takes the supplier's catalog price (RN-30).</param>
public sealed record PurchaseOrderLineRequest(Guid? LineId, Guid ItemId, decimal Quantity, decimal? UnitPrice);

public sealed record CreatePurchaseOrderRequest(
    Guid SupplierId, Guid DeliveryLocationId, DateOnly ExpectedDate, string? Notes, IReadOnlyList<PurchaseOrderLineRequest> Lines);

/// <summary>The supplier is fixed once the order is saved.</summary>
public sealed record UpdatePurchaseOrderRequest(
    uint Version, Guid DeliveryLocationId, DateOnly ExpectedDate, string? Notes, IReadOnlyList<PurchaseOrderLineRequest> Lines);

public sealed record RejectPurchaseOrderRequest(uint Version, string Reason);

public sealed record ClosePurchaseOrderRequest(uint Version, string Reason);

/// <summary>Tabs of the purchase orders screen (frontend: Todas, Por aprobar, Por recibir).</summary>
public enum PurchaseOrderTab
{
    All,
    ToApprove,
    ToReceive,
}

public sealed record PurchaseOrderListQuery : PageQuery
{
    public PurchaseOrderTab? Tab { get; init; }
    public PurchaseOrderStatus? Status { get; init; }

    /// <summary>true: approved or partially received (same as <c>tab=ToReceive</c>).</summary>
    public bool? PendingReceipt { get; init; }

    public Guid? SupplierId { get; init; }
    public Guid? LocationId { get; init; }

    /// <summary>ExpectedDate from this date (inclusive).</summary>
    public DateOnly? From { get; init; }

    /// <summary>ExpectedDate up to this date (inclusive).</summary>
    public DateOnly? To { get; init; }
}

public sealed record PurchaseOrderListItemDto(
    Guid Id,
    string Folio,
    Guid SupplierId,
    string SupplierName,
    Guid DeliveryLocationId,
    string DeliveryLocationCode,
    DateOnly ExpectedDate,
    PurchaseOrderStatus Status,
    int LineCount,
    decimal Subtotal,
    decimal TaxTotal,
    decimal Total,
    DateTimeOffset CreatedAt);

/// <param name="UomCode">Purchase unit, or base unit when the item has none.</param>
/// <param name="MaxReceivableQty">Ordered quantity plus the receipt tolerance (RN-32), minus what was received.</param>
public sealed record PurchaseOrderLineDto(
    Guid Id,
    int LineNumber,
    Guid ItemId,
    string Sku,
    string ItemName,
    string UomCode,
    string BaseUomCode,
    decimal PurchaseToBaseFactor,
    bool TracksLots,
    decimal Quantity,
    decimal UnitPrice,
    decimal TaxRate,
    decimal Subtotal,
    decimal TaxAmount,
    decimal ReceivedQty,
    decimal PendingQty,
    decimal MaxReceivableQty,
    Guid? RequisitionLineId,
    Guid? RequisitionId,
    string? RequisitionFolio);

public sealed record PurchaseOrderReceiptSummaryDto(Guid Id, string Folio, DateTimeOffset ReceivedAt, string? SupplierInvoiceNumber);

public sealed record PurchaseOrderDto(
    Guid Id,
    string Folio,
    Guid SupplierId,
    string SupplierTaxId,
    string SupplierName,
    int PaymentTermsDays,
    Guid DeliveryLocationId,
    string DeliveryLocationCode,
    string DeliveryLocationName,
    DateOnly ExpectedDate,
    PurchaseOrderStatus Status,
    string? Notes,
    IReadOnlyList<PurchaseOrderLineDto> Lines,
    decimal Subtotal,
    decimal TaxTotal,
    decimal Total,
    decimal ReceiptTolerancePct,
    DateTimeOffset? SubmittedAt,
    string? SubmittedByName,
    DateTimeOffset? ApprovedAt,
    string? ApprovedByName,
    bool ApprovedAutomatically,
    DateTimeOffset? RejectedAt,
    string? RejectedByName,
    string? RejectionReason,
    DateTimeOffset? ClosedAt,
    string? ClosedByName,
    string? CloseReason,
    IReadOnlyList<PurchaseOrderReceiptSummaryDto> Receipts,
    DateTimeOffset CreatedAt,
    string? CreatedByName,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    uint Version);

// Validators

public sealed class PurchaseOrderLineRequestValidator : AbstractValidator<PurchaseOrderLineRequest>
{
    public PurchaseOrderLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => p is null || decimal.Round(p.Value, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
    }
}

public sealed class CreatePurchaseOrderRequestValidator : AbstractValidator<CreatePurchaseOrderRequest>
{
    public CreatePurchaseOrderRequestValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty().WithName("Proveedor");
        RuleFor(x => x.DeliveryLocationId).NotEmpty().WithName("Ubicación de entrega");
        RuleFor(x => x.Notes).MaximumLength(PurchaseOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).SetValidator(new PurchaseOrderLineRequestValidator());
    }
}

public sealed class UpdatePurchaseOrderRequestValidator : AbstractValidator<UpdatePurchaseOrderRequest>
{
    public UpdatePurchaseOrderRequestValidator()
    {
        RuleFor(x => x.DeliveryLocationId).NotEmpty().WithName("Ubicación de entrega");
        RuleFor(x => x.Notes).MaximumLength(PurchaseOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Where(x => x.LineId is not null).Select(x => x.LineId).Distinct().Count() == l.Count(x => x.LineId is not null))
            .WithMessage("Hay líneas repetidas.");
        RuleForEach(x => x.Lines).SetValidator(new PurchaseOrderLineRequestValidator());
    }
}

public sealed class ClosePurchaseOrderRequestValidator : AbstractValidator<ClosePurchaseOrderRequest>
{
    public ClosePurchaseOrderRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public sealed class RejectPurchaseOrderRequestValidator : AbstractValidator<RejectPurchaseOrderRequest>
{
    public RejectPurchaseOrderRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}
