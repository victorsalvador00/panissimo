using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Domain.Purchasing;

/// <summary>Editable data of a supplier (dominio §4.7).</summary>
public sealed record SupplierDefinition(
    string TaxId,
    string Name,
    string? ContactName,
    string? Phone,
    string? Email,
    int PaymentTermsDays);

public static class SupplierRules
{
    public const int NameMaxLength = 200;
    public const int ContactNameMaxLength = 150;
    public const int PhoneMaxLength = 30;
    public const int EmailMaxLength = 200;
    public const int MaxPaymentTermsDays = 365;
    public const int SupplierSkuMaxLength = 50;
    public const int MaxLeadTimeDays = 365;

    /// <summary>Only raw materials and supplies are bought (dominio, Compras).</summary>
    public static bool IsPurchasable(ItemType type) => type is ItemType.RawMaterial or ItemType.Supply;
}

[Audited]
public class Supplier : AuditableEntity, IVersioned
{
    private Supplier() { }

    public Supplier(SupplierDefinition definition)
    {
        Apply(definition);
        IsActive = true;
    }

    /// <summary>RFC in upper case (RN-35).</summary>
    public string TaxId { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public string? ContactName { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }

    /// <summary>0 = cash.</summary>
    public int PaymentTermsDays { get; private set; }

    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(SupplierDefinition definition) => Apply(definition);

    public void Activate() => IsActive = true;

    /// <summary>The service clears the supplier's preferences in the same transaction (RN-35).</summary>
    public void Deactivate() => IsActive = false;

    /// <summary>RN-35: an inactive supplier's items are not edited until it is reactivated.</summary>
    public void EnsureEditable()
    {
        if (!IsActive)
            throw new BusinessRuleException("supplier_inactive",
                $"El proveedor {Name} está inactivo: reactívalo para editar sus artículos.");
    }

    private void Apply(SupplierDefinition d)
    {
        var taxId = TaxIdRules.Normalize(d.TaxId);
        if (!TaxIdRules.IsValid(taxId))
            throw new BusinessRuleException("invalid_tax_id", TaxIdRules.InvalidMessage);
        if (d.PaymentTermsDays is < 0 or > SupplierRules.MaxPaymentTermsDays)
            throw new BusinessRuleException("invalid_payment_terms",
                $"Los días de crédito van de 0 a {SupplierRules.MaxPaymentTermsDays}.");

        TaxId = taxId;
        Name = d.Name.Trim();
        ContactName = Clean(d.ContactName);
        Phone = Clean(d.Phone);
        Email = Clean(d.Email);
        PaymentTermsDays = d.PaymentTermsDays;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>An item a supplier sells, with its price and lead time. Unique per (supplier, item).</summary>
[Audited]
public class SupplierItem : AuditableEntity, IVersioned
{
    private SupplierItem() { }

    public SupplierItem(Guid supplierId, Guid itemId, string? supplierSku, decimal price, int leadTimeDays)
    {
        SupplierId = supplierId;
        ItemId = itemId;
        Update(supplierSku, price, leadTimeDays);
        IsActive = true;
    }

    public Guid SupplierId { get; private set; }
    public Guid ItemId { get; private set; }
    public string? SupplierSku { get; private set; }

    /// <summary>Per purchase unit, or per base unit when the item has none; without VAT.</summary>
    public decimal Price { get; private set; }

    public int LeadTimeDays { get; private set; }

    /// <summary>At most one per item (RN-35); never on an inactive row.</summary>
    public bool IsPreferred { get; private set; }

    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string? supplierSku, decimal price, int leadTimeDays)
    {
        if (price < 0)
            throw new BusinessRuleException("invalid_price", "El precio no puede ser negativo.");
        if (leadTimeDays is < 0 or > SupplierRules.MaxLeadTimeDays)
            throw new BusinessRuleException("invalid_lead_time", $"Los días de entrega van de 0 a {SupplierRules.MaxLeadTimeDays}.");
        SupplierSku = string.IsNullOrWhiteSpace(supplierSku) ? null : supplierSku.Trim();
        Price = price;
        LeadTimeDays = leadTimeDays;
    }

    /// <summary>The service unmarks the item's previous preferred row first (RN-35).</summary>
    public void MarkPreferred()
    {
        if (!IsActive)
            throw new BusinessRuleException("supplier_item_inactive", "Un artículo de proveedor inactivo no puede ser el preferido.");
        IsPreferred = true;
    }

    public void ClearPreferred() => IsPreferred = false;

    public void Activate() => IsActive = true;

    public void Deactivate()
    {
        IsActive = false;
        IsPreferred = false;
    }
}
