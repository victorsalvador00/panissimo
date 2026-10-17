using System.Text.RegularExpressions;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Domain.Sales;

/// <summary>Editable data of a customer (dominio §4.6). The code is fixed once created.</summary>
public sealed record CustomerDefinition(
    string Name,
    string? TaxId,
    string? ContactName,
    string? Phone,
    string? Email,
    string? Notes);

public static partial class CustomerRules
{
    public const int CodeMaxLength = 20;
    public const int NameMaxLength = 200;
    public const int ContactNameMaxLength = 150;
    public const int PhoneMaxLength = 30;
    public const int EmailMaxLength = 200;
    public const int NotesMaxLength = 500;
    public const int DeliveryPointNameMaxLength = 150;
    public const int AddressMaxLength = 300;
    public const int CustomerSkuMaxLength = 50;

    [GeneratedRegex("^[A-Z0-9][A-Z0-9-]*$")]
    private static partial Regex CodePattern();

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public static bool IsValidCode(string normalized) => normalized.Length <= CodeMaxLength && CodePattern().IsMatch(normalized);

    /// <summary>D-05: third-party customers buy packaged finished goods only.</summary>
    public static bool IsSellable(ItemType type, ItemPresentation? presentation) =>
        type == ItemType.FinishedGood && presentation == ItemPresentation.Packaged;

    /// <summary>Null when blank; otherwise the upper-case RFC (RN-35 rules apply when present).</summary>
    public static string? NormalizeTaxId(string? taxId) => string.IsNullOrWhiteSpace(taxId) ? null : TaxIdRules.Normalize(taxId);

    internal static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

[Audited]
public class Customer : AuditableEntity, IVersioned
{
    private Customer() { }

    public Customer(string code, CustomerDefinition definition)
    {
        var normalized = CustomerRules.NormalizeCode(code);
        if (!CustomerRules.IsValidCode(normalized))
            throw new BusinessRuleException("invalid_customer_code", "El código solo admite letras, números y guion (ej. CLI-001).");
        Code = normalized;
        Apply(definition);
        IsActive = true;
    }

    public string Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;

    /// <summary>Optional RFC; same rules as a supplier's (RN-35).</summary>
    public string? TaxId { get; private set; }

    public string? ContactName { get; private set; }
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public string? Notes { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(CustomerDefinition definition) => Apply(definition);
    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;

    private void Apply(CustomerDefinition d)
    {
        var taxId = CustomerRules.NormalizeTaxId(d.TaxId);
        if (taxId is not null && !TaxIdRules.IsValid(taxId))
            throw new BusinessRuleException("invalid_tax_id", TaxIdRules.InvalidMessage);
        Name = d.Name.Trim();
        TaxId = taxId;
        ContactName = CustomerRules.Clean(d.ContactName);
        Phone = CustomerRules.Clean(d.Phone);
        Email = CustomerRules.Clean(d.Email);
        Notes = CustomerRules.Clean(d.Notes);
    }
}

[Audited]
public class CustomerDeliveryPoint : AuditableEntity, IVersioned
{
    private CustomerDeliveryPoint() { }

    public CustomerDeliveryPoint(Guid customerId, string name, string? address)
    {
        CustomerId = customerId;
        Update(name, address);
        IsActive = true;
    }

    public Guid CustomerId { get; private set; }
    public string Name { get; private set; } = null!;
    public string? Address { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string name, string? address)
    {
        Name = name.Trim();
        Address = CustomerRules.Clean(address);
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}

/// <summary>A packaged item the customer buys, with its own SKU and an informative price (D-06). Unique per (customer, item).</summary>
[Audited]
public class CustomerItem : AuditableEntity, IVersioned
{
    private CustomerItem() { }

    public CustomerItem(Guid customerId, Guid itemId, string? customerSku, decimal? price)
    {
        CustomerId = customerId;
        ItemId = itemId;
        Update(customerSku, price);
        IsActive = true;
    }

    public Guid CustomerId { get; private set; }
    public Guid ItemId { get; private set; }
    public string? CustomerSku { get; private set; }

    /// <summary>Without VAT, informative only (RN-83).</summary>
    public decimal? Price { get; private set; }

    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string? customerSku, decimal? price)
    {
        if (price < 0)
            throw new BusinessRuleException("invalid_price", "El precio no puede ser negativo.");
        CustomerSku = CustomerRules.Clean(customerSku);
        Price = price;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}
