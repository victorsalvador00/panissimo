using System.Globalization;
using System.Text.RegularExpressions;
using Sgo.Domain.Common;

namespace Sgo.Domain.Purchasing;

public static partial class TaxIdRules
{
    /// <summary>SAT generic RFCs (general public / foreign supplier); several suppliers may share them.</summary>
    public static readonly IReadOnlySet<string> GenericTaxIds = new HashSet<string> { "XAXX010101000", "XEXX010101000" };

    public static string Normalize(string taxId) => taxId.Trim().ToUpperInvariant();

    /// <summary>RFC: 3 letters (legal entity, 12 chars) or 4 (individual, 13 chars), a valid yyMMdd date and a 3-char check code.</summary>
    public static bool IsValid(string? taxId)
    {
        if (string.IsNullOrWhiteSpace(taxId)) return false;
        var match = TaxIdPattern().Match(Normalize(taxId));
        return match.Success && DateOnly.TryParseExact(match.Groups["date"].Value, "yyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out _);
    }

    [GeneratedRegex("^[A-ZÑ&]{3,4}(?<date>[0-9]{6})[A-Z0-9]{3}$")]
    private static partial Regex TaxIdPattern();
}

/// <summary>Supplier catalog (dominio §4.6). Identified by its RFC; deactivated, never deleted.</summary>
[Audited]
public class Supplier : AuditableEntity, IVersioned
{
    private Supplier() { }

    public Supplier(string taxId, string name, string? contactName, string? phone, string? email, int paymentTermsDays)
    {
        Update(taxId, name, contactName, phone, email, paymentTermsDays);
        IsActive = true;
    }

    public string TaxId { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public string? ContactName { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public int PaymentTermsDays { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string taxId, string name, string? contactName, string? phone, string? email, int paymentTermsDays)
    {
        if (!TaxIdRules.IsValid(taxId))
            throw new BusinessRuleException("supplier_invalid_tax_id", "El RFC no tiene un formato válido.");
        if (paymentTermsDays < 0)
            throw new BusinessRuleException("supplier_invalid_payment_terms", "Los días de crédito no pueden ser negativos.");

        TaxId = TaxIdRules.Normalize(taxId);
        Name = name.Trim();
        ContactName = Clean(contactName);
        Phone = Clean(phone);
        Email = Clean(email)?.ToLowerInvariant();
        PaymentTermsDays = paymentTermsDays;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>
/// An item a supplier sells, with its price per purchase unit (without VAT). RN-30 suggests PO prices from here.
/// At most one active row per item is preferred; B-13 uses it as the suggested supplier.
/// </summary>
[Audited]
public class SupplierItem : AuditableEntity, IVersioned
{
    private SupplierItem() { }

    public SupplierItem(Guid supplierId, Guid itemId, string? supplierSku, decimal price, int leadTimeDays)
    {
        SupplierId = supplierId;
        ItemId = itemId;
        IsActive = true;
        Update(supplierSku, price, leadTimeDays);
    }

    public Guid SupplierId { get; private set; }
    public Guid ItemId { get; private set; }
    public string? SupplierSku { get; private set; }

    /// <summary>Per purchase unit, MXN without VAT.</summary>
    public decimal Price { get; private set; }

    public int LeadTimeDays { get; private set; }
    public bool IsPreferred { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string? supplierSku, decimal price, int leadTimeDays)
    {
        if (price < 0)
            throw new BusinessRuleException("supplier_item_invalid_price", "El precio no puede ser negativo.");
        if (decimal.Round(price, 4) != price)
            throw new BusinessRuleException("supplier_item_invalid_price", "El precio admite máximo 4 decimales.");
        if (leadTimeDays < 0)
            throw new BusinessRuleException("supplier_item_invalid_lead_time", "Los días de entrega no pueden ser negativos.");

        SupplierSku = string.IsNullOrWhiteSpace(supplierSku) ? null : supplierSku.Trim();
        Price = price;
        LeadTimeDays = leadTimeDays;
    }

    public void MarkPreferred()
    {
        if (!IsActive)
            throw new BusinessRuleException("supplier_item_inactive", "Un artículo inactivo no puede ser el preferido.");
        IsPreferred = true;
    }

    public void UnmarkPreferred() => IsPreferred = false;

    public void Activate() => IsActive = true;

    /// <summary>An inactive row stops being preferred, so it is never suggested.</summary>
    public void Deactivate()
    {
        IsActive = false;
        IsPreferred = false;
    }
}
