using FluentValidation;
using Panissimo.Application.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

/// <param name="Quantity">In purchase unit (or base unit when the item has none).</param>
/// <param name="SuggestedSupplierId">Empty takes the item's preferred supplier (RN-34).</param>
public sealed record RequisitionLineRequest(Guid ItemId, decimal Quantity, Guid? SuggestedSupplierId);

public sealed record CreateRequisitionRequest(Guid LocationId, DateOnly NeededBy, string? Notes, IReadOnlyList<RequisitionLineRequest> Lines);

public sealed record UpdateRequisitionRequest(uint Version, DateOnly NeededBy, string? Notes, IReadOnlyList<RequisitionLineRequest> Lines);

public sealed record RejectRequisitionRequest(uint Version, string Reason);

/// <summary>Approved requisitions to turn into purchase orders, all or nothing (RN-34).</summary>
public sealed record ConvertRequisitionsRequest(IReadOnlyList<Guid> RequisitionIds);

public sealed record RequisitionListQuery : PageQuery
{
    public RequisitionStatus? Status { get; init; }
    public Guid? LocationId { get; init; }

    /// <summary>NeededBy from this date (inclusive).</summary>
    public DateOnly? From { get; init; }

    /// <summary>NeededBy up to this date (inclusive).</summary>
    public DateOnly? To { get; init; }
}

public sealed record RequisitionListItemDto(
    Guid Id,
    string Folio,
    Guid LocationId,
    string LocationCode,
    string LocationName,
    DateOnly NeededBy,
    RequisitionStatus Status,
    int LineCount,
    decimal EstimatedSubtotal,
    DateTimeOffset CreatedAt,
    string? CreatedByName);

/// <param name="UomCode">Purchase unit, or base unit when the item has none.</param>
/// <param name="EstimatedUnitPrice">Current catalog price of the suggested supplier; null without one.</param>
/// <param name="EstimatedAmount">Quantity × estimated price, rounded to cents.</param>
/// <param name="PurchaseOrderId">The purchase order the line became, once converted.</param>
public sealed record RequisitionLineDto(
    Guid Id,
    int LineNumber,
    Guid ItemId,
    string Sku,
    string ItemName,
    string UomCode,
    decimal Quantity,
    Guid? SuggestedSupplierId,
    string? SuggestedSupplierName,
    decimal? EstimatedUnitPrice,
    decimal? EstimatedAmount,
    Guid? PurchaseOrderId,
    string? PurchaseOrderFolio);

public sealed record RequisitionDto(
    Guid Id,
    string Folio,
    Guid LocationId,
    string LocationCode,
    string LocationName,
    DateOnly NeededBy,
    RequisitionStatus Status,
    string? Notes,
    IReadOnlyList<RequisitionLineDto> Lines,
    decimal EstimatedSubtotal,
    DateTimeOffset? SubmittedAt,
    string? SubmittedByName,
    DateTimeOffset? ApprovedAt,
    string? ApprovedByName,
    DateTimeOffset? RejectedAt,
    string? RejectedByName,
    string? RejectionReason,
    DateTimeOffset? ConvertedAt,
    DateTimeOffset CreatedAt,
    string? CreatedByName,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    uint Version);

public sealed record ConvertedPurchaseOrderDto(
    Guid Id,
    string Folio,
    Guid SupplierId,
    string SupplierName,
    Guid DeliveryLocationId,
    DateOnly ExpectedDate,
    int LineCount,
    decimal Subtotal,
    decimal TaxTotal,
    decimal Total,
    IReadOnlyList<string> RequisitionFolios);

public sealed record ConvertRequisitionsResult(IReadOnlyList<ConvertedPurchaseOrderDto> PurchaseOrders);

// Validators

public sealed class RequisitionLineRequestValidator : AbstractValidator<RequisitionLineRequest>
{
    public RequisitionLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
    }
}

public sealed class CreateRequisitionRequestValidator : AbstractValidator<CreateRequisitionRequest>
{
    public CreateRequisitionRequestValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithName("Ubicación");
        RuleFor(x => x.Notes).MaximumLength(PurchaseRequisition.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en la requisición.");
        RuleForEach(x => x.Lines).SetValidator(new RequisitionLineRequestValidator());
    }
}

public sealed class UpdateRequisitionRequestValidator : AbstractValidator<UpdateRequisitionRequest>
{
    public UpdateRequisitionRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(PurchaseRequisition.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en la requisición.");
        RuleForEach(x => x.Lines).SetValidator(new RequisitionLineRequestValidator());
    }
}

public sealed class RejectRequisitionRequestValidator : AbstractValidator<RejectRequisitionRequest>
{
    public RejectRequisitionRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public sealed class ConvertRequisitionsRequestValidator : AbstractValidator<ConvertRequisitionsRequest>
{
    public const int MaxRequisitions = 100;

    public ConvertRequisitionsRequestValidator() =>
        RuleFor(x => x.RequisitionIds).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Selecciona al menos una requisición.")
            .Must(ids => ids.Count <= MaxRequisitions).WithMessage($"Convierte máximo {MaxRequisitions} requisiciones a la vez.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay requisiciones repetidas.");
}
