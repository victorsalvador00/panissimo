using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Domain.Purchasing;

namespace Sgo.Application.Purchasing;

public sealed record SupplierDto(
    Guid Id, string TaxId, string Name, string? ContactName, string? Phone, string? Email, int PaymentTermsDays, bool IsActive, uint Version);

public sealed record CreateSupplierRequest(string TaxId, string Name, string? ContactName, string? Phone, string? Email, int PaymentTermsDays);

/// <summary>Deactivating a supplier also removes it as preferred supplier of its items.</summary>
public sealed record UpdateSupplierRequest(
    uint Version, string TaxId, string Name, string? ContactName, string? Phone, string? Email, int PaymentTermsDays, bool IsActive);

public sealed record SupplierItemListQuery : CatalogListQuery
{
    public Guid? ItemId { get; init; }
}

/// <param name="PurchaseUomCode">Unit the price refers to: the item's purchase unit, or its base unit when it has none.</param>
/// <param name="BaseUomCode">Item's base unit, to show the price per base unit (Price / PurchaseToBaseFactor).</param>
/// <param name="TaxRate">Item's VAT rate, for the PO editor's live totals.</param>
public sealed record SupplierItemDto(
    Guid Id, Guid SupplierId, Guid ItemId, string Sku, string Name, string PurchaseUomCode, decimal PurchaseToBaseFactor,
    string BaseUomCode, decimal TaxRate, bool TracksLots, string? SupplierSku, decimal Price, int LeadTimeDays, bool IsPreferred, bool IsActive, uint Version);

/// <summary>An active supplier that sells the item, with its current price per purchase unit (without VAT).</summary>
public sealed record SupplierOfferDto(
    Guid SupplierId, string SupplierName, Guid SupplierItemId, string? SupplierSku, decimal Price, int LeadTimeDays, bool IsPreferred);

/// <param name="PurchaseUomCode">Unit of requisition and PO quantities: the item's purchase unit, or its base unit.</param>
/// <param name="Offers">Preferred supplier first, then by price.</param>
public sealed record ItemSupplierOffersDto(
    Guid ItemId, string Sku, string Name, string PurchaseUomCode, decimal PurchaseToBaseFactor, string BaseUomCode,
    IReadOnlyList<SupplierOfferDto> Offers);

public sealed record CreateSupplierItemRequest(Guid ItemId, string? SupplierSku, decimal Price, int LeadTimeDays, bool IsPreferred);

/// <summary>Marking it preferred unmarks the item's current preferred supplier. An inactive row is never preferred.</summary>
public sealed record UpdateSupplierItemRequest(uint Version, string? SupplierSku, decimal Price, int LeadTimeDays, bool IsPreferred, bool IsActive);

internal static class SupplierFieldRules
{
    public const int MaxDays = 365;

    public static void TaxId<T>(IRuleBuilderInitial<T, string> rule) =>
        rule.Cascade(CascadeMode.Stop).NotEmpty().WithName("RFC")
            .Must(TaxIdRules.IsValid).WithMessage("El RFC no tiene un formato válido (12 caracteres persona moral, 13 persona física).");
}

public sealed class CreateSupplierRequestValidator : AbstractValidator<CreateSupplierRequest>
{
    public CreateSupplierRequestValidator()
    {
        SupplierFieldRules.TaxId(RuleFor(x => x.TaxId));
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithName("Razón social");
        RuleFor(x => x.ContactName).MaximumLength(150).WithName("Contacto");
        RuleFor(x => x.Phone).MaximumLength(30).WithName("Teléfono");
        RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithName("Correo");
        RuleFor(x => x.PaymentTermsDays).InclusiveBetween(0, SupplierFieldRules.MaxDays).WithName("Días de crédito");
    }
}

public sealed class UpdateSupplierRequestValidator : AbstractValidator<UpdateSupplierRequest>
{
    public UpdateSupplierRequestValidator()
    {
        SupplierFieldRules.TaxId(RuleFor(x => x.TaxId));
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithName("Razón social");
        RuleFor(x => x.ContactName).MaximumLength(150).WithName("Contacto");
        RuleFor(x => x.Phone).MaximumLength(30).WithName("Teléfono");
        RuleFor(x => x.Email).MaximumLength(254).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email)).WithName("Correo");
        RuleFor(x => x.PaymentTermsDays).InclusiveBetween(0, SupplierFieldRules.MaxDays).WithName("Días de crédito");
    }
}

public sealed class CreateSupplierItemRequestValidator : AbstractValidator<CreateSupplierItemRequest>
{
    public CreateSupplierItemRequestValidator()
    {
        RuleFor(x => x.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(x => x.SupplierSku).MaximumLength(50).WithName("Clave del proveedor");
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => decimal.Round(p, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
        RuleFor(x => x.LeadTimeDays).InclusiveBetween(0, SupplierFieldRules.MaxDays).WithName("Días de entrega");
    }
}

public sealed class UpdateSupplierItemRequestValidator : AbstractValidator<UpdateSupplierItemRequest>
{
    public UpdateSupplierItemRequestValidator()
    {
        RuleFor(x => x.SupplierSku).MaximumLength(50).WithName("Clave del proveedor");
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => decimal.Round(p, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
        RuleFor(x => x.LeadTimeDays).InclusiveBetween(0, SupplierFieldRules.MaxDays).WithName("Días de entrega");
        RuleFor(x => x.IsPreferred).Equal(false).When(x => !x.IsActive)
            .WithMessage("Un artículo inactivo no puede ser el preferido.");
    }
}

public interface ISupplierService
{
    Task<PagedResult<SupplierDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default);
    Task<SupplierDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<SupplierDto> CreateAsync(CreateSupplierRequest request, CancellationToken ct = default);
    Task<SupplierDto> UpdateAsync(Guid id, UpdateSupplierRequest request, CancellationToken ct = default);

    Task<PagedResult<SupplierItemDto>> ListItemsAsync(Guid supplierId, SupplierItemListQuery query, CancellationToken ct = default);
    Task<SupplierItemDto> GetItemAsync(Guid supplierId, Guid supplierItemId, CancellationToken ct = default);
    Task<SupplierItemDto> AddItemAsync(Guid supplierId, CreateSupplierItemRequest request, CancellationToken ct = default);
    Task<SupplierItemDto> UpdateItemAsync(Guid supplierId, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct = default);

    /// <summary>Active suppliers (and active supplier items) that sell the item, for requisition lines.</summary>
    Task<ItemSupplierOffersDto> OffersAsync(Guid itemId, CancellationToken ct = default);
}

public sealed class SupplierService(ISgoDbContext db, ITransactionLocks locks) : ISupplierService
{
    private static readonly Dictionary<string, Expression<Func<Supplier, object?>>> SortColumns = new()
    {
        ["name"] = s => s.Name,
        ["taxId"] = s => s.TaxId,
        ["paymentTermsDays"] = s => s.PaymentTermsDays,
    };

    private static readonly Dictionary<string, Expression<Func<SupplierItemRow, object?>>> ItemSortColumns = new()
    {
        ["sku"] = i => i.Sku,
        ["name"] = i => i.Name,
        ["price"] = i => i.Price,
        ["leadTimeDays"] = i => i.LeadTimeDays,
    };

    public Task<PagedResult<SupplierDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default)
    {
        var suppliers = db.Suppliers.AsNoTracking();
        if (!query.IncludeInactive)
            suppliers = suppliers.Where(s => s.IsActive);
        if (query.SearchTerm() is { } term)
            suppliers = suppliers.Where(s => s.Name.ToLower().Contains(term) || s.TaxId.ToLower().Contains(term));

        return suppliers.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, PurchasingMapping.ToDto, ct);
    }

    public async Task<SupplierDto> GetAsync(Guid id, CancellationToken ct = default) => (await FindAsync(id, ct)).ToDto();

    public async Task<SupplierDto> CreateAsync(CreateSupplierRequest request, CancellationToken ct = default)
    {
        await EnsureUniqueTaxIdAsync(request.TaxId, null, ct);
        var supplier = new Supplier(request.TaxId, request.Name, request.ContactName, request.Phone, request.Email, request.PaymentTermsDays);
        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);
        return supplier.ToDto();
    }

    public async Task<SupplierDto> UpdateAsync(Guid id, UpdateSupplierRequest request, CancellationToken ct = default)
    {
        var supplier = await FindAsync(id, ct);
        db.EnsureVersion(supplier, request.Version);
        await EnsureUniqueTaxIdAsync(request.TaxId, id, ct);

        supplier.Update(request.TaxId, request.Name, request.ContactName, request.Phone, request.Email, request.PaymentTermsDays);
        if (request.IsActive)
        {
            supplier.Activate();
        }
        else if (supplier.IsActive)
        {
            supplier.Deactivate();
            foreach (var preferred in await db.SupplierItems.Where(i => i.SupplierId == id && i.IsPreferred).ToListAsync(ct))
                preferred.UnmarkPreferred();
        }

        await db.SaveChangesAsync(ct);
        return supplier.ToDto();
    }

    public async Task<PagedResult<SupplierItemDto>> ListItemsAsync(Guid supplierId, SupplierItemListQuery query, CancellationToken ct = default)
    {
        await FindAsync(supplierId, ct);
        var rows = ItemRows().Where(i => i.SupplierId == supplierId);
        if (!query.IncludeInactive)
            rows = rows.Where(i => i.IsActive);
        if (query.ItemId is { } itemId)
            rows = rows.Where(i => i.ItemId == itemId);
        if (query.SearchTerm() is { } term)
            rows = rows.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term)
                                   || (i.SupplierSku != null && i.SupplierSku.ToLower().Contains(term)));

        return await rows.ApplySort(query.Sort, ItemSortColumns, "sku").ToPagedResultAsync(query, r => r.ToDto(), ct);
    }

    public async Task<SupplierItemDto> GetItemAsync(Guid supplierId, Guid supplierItemId, CancellationToken ct = default) =>
        (await ItemRows().SingleOrDefaultAsync(i => i.Id == supplierItemId && i.SupplierId == supplierId, ct)
         ?? throw new NotFoundException("el artículo del proveedor", supplierItemId)).ToDto();

    public async Task<SupplierItemDto> AddItemAsync(Guid supplierId, CreateSupplierItemRequest request, CancellationToken ct = default)
    {
        var supplier = await FindAsync(supplierId, ct);
        EnsureActive(supplier);

        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.ItemId, ct)
                   ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["itemId"] = ["El artículo no existe."] });
        if (!item.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {item.Sku} está inactivo.");
        if (await db.SupplierItems.AnyAsync(i => i.SupplierId == supplierId && i.ItemId == item.Id, ct))
            throw new BusinessRuleException("supplier_item_duplicate",
                $"El artículo {item.Sku} ya está ligado a este proveedor; edítalo (o reactívalo) en lugar de agregarlo de nuevo.");

        var supplierItem = new SupplierItem(supplierId, item.Id, request.SupplierSku, request.Price, request.LeadTimeDays);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (request.IsPreferred)
        {
            await UnmarkCurrentPreferredAsync(item.Id, null, ct);
            supplierItem.MarkPreferred();
        }
        db.SupplierItems.Add(supplierItem);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetItemAsync(supplierId, supplierItem.Id, ct);
    }

    public async Task<SupplierItemDto> UpdateItemAsync(
        Guid supplierId, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct = default)
    {
        var supplier = await FindAsync(supplierId, ct);
        EnsureActive(supplier);
        var supplierItem = await db.SupplierItems.SingleOrDefaultAsync(i => i.Id == supplierItemId && i.SupplierId == supplierId, ct)
                           ?? throw new NotFoundException("el artículo del proveedor", supplierItemId);
        db.EnsureVersion(supplierItem, request.Version);

        if (request.IsActive && !supplierItem.IsActive
            && !await db.Items.AnyAsync(i => i.Id == supplierItem.ItemId && i.IsActive, ct))
            throw new BusinessRuleException("item_inactive", "El artículo está inactivo; no puede reactivarse con este proveedor.");

        supplierItem.Update(request.SupplierSku, request.Price, request.LeadTimeDays);
        if (request.IsActive) supplierItem.Activate(); else supplierItem.Deactivate();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (request.IsPreferred && !supplierItem.IsPreferred)
        {
            await UnmarkCurrentPreferredAsync(supplierItem.ItemId, supplierItem.Id, ct);
            supplierItem.MarkPreferred();
        }
        else if (!request.IsPreferred)
        {
            supplierItem.UnmarkPreferred();
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await GetItemAsync(supplierId, supplierItem.Id, ct);
    }

    public async Task<ItemSupplierOffersDto> OffersAsync(Guid itemId, CancellationToken ct = default)
    {
        var item = await (from i in db.Items.AsNoTracking()
                          join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                          join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                          where i.Id == itemId
                          select new { i.Id, i.Sku, i.Name, UomCode = u.Code, i.PurchaseToBaseFactor, BaseUomCode = b.Code })
                   .SingleOrDefaultAsync(ct)
                   ?? throw new NotFoundException("el artículo", itemId);

        var offers = await (from si in db.SupplierItems.AsNoTracking()
                            join s in db.Suppliers on si.SupplierId equals s.Id
                            where si.ItemId == itemId && si.IsActive && s.IsActive
                            orderby si.IsPreferred descending, si.Price, s.Name
                            select new SupplierOfferDto(s.Id, s.Name, si.Id, si.SupplierSku, si.Price, si.LeadTimeDays, si.IsPreferred))
                           .ToListAsync(ct);

        return new ItemSupplierOffersDto(item.Id, item.Sku, item.Name, item.UomCode, item.PurchaseToBaseFactor, item.BaseUomCode, offers);
    }

    /// <summary>
    /// The partial unique index allows one preferred row per item: the old one must be saved first. The lock makes
    /// two simultaneous "preferred" changes for the same item run one after the other (the last one wins) instead of
    /// the second breaking the index.
    /// </summary>
    private async Task UnmarkCurrentPreferredAsync(Guid itemId, Guid? exceptId, CancellationToken ct)
    {
        await locks.AcquireAsync(TransactionLockScopes.PreferredSupplier, itemId.ToString(), ct);
        var current = await db.SupplierItems.Where(i => i.ItemId == itemId && i.IsPreferred && i.Id != exceptId).ToListAsync(ct);
        if (current.Count == 0) return;
        foreach (var row in current)
            row.UnmarkPreferred();
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Member-init projection so EF can still filter and sort on it (a record constructor cannot be translated).</summary>
    private sealed class SupplierItemRow
    {
        public Guid Id { get; init; }
        public Guid SupplierId { get; init; }
        public Guid ItemId { get; init; }
        public string Sku { get; init; } = null!;
        public string Name { get; init; } = null!;
        public string UomCode { get; init; } = null!;
        public decimal PurchaseToBaseFactor { get; init; }
        public string BaseUomCode { get; init; } = null!;
        public decimal TaxRate { get; init; }
        public bool TracksLots { get; init; }
        public string? SupplierSku { get; init; }
        public decimal Price { get; init; }
        public int LeadTimeDays { get; init; }
        public bool IsPreferred { get; init; }
        public bool IsActive { get; init; }
        public uint Version { get; init; }

        public SupplierItemDto ToDto() => new(Id, SupplierId, ItemId, Sku, Name, UomCode, PurchaseToBaseFactor, BaseUomCode, TaxRate, TracksLots, SupplierSku, Price,
            LeadTimeDays, IsPreferred, IsActive, Version);
    }

    private IQueryable<SupplierItemRow> ItemRows() =>
        from si in db.SupplierItems.AsNoTracking()
        join i in db.Items on si.ItemId equals i.Id
        join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
        join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
        select new SupplierItemRow
        {
            Id = si.Id, SupplierId = si.SupplierId, ItemId = si.ItemId, Sku = i.Sku, Name = i.Name, UomCode = u.Code,
            PurchaseToBaseFactor = i.PurchaseToBaseFactor, BaseUomCode = b.Code, TaxRate = i.TaxRate,
            TracksLots = i.TracksLots, SupplierSku = si.SupplierSku, Price = si.Price,
            LeadTimeDays = si.LeadTimeDays, IsPreferred = si.IsPreferred, IsActive = si.IsActive, Version = si.Version,
        };

    private static void EnsureActive(Supplier supplier)
    {
        if (!supplier.IsActive)
            throw new BusinessRuleException("supplier_inactive", $"El proveedor {supplier.Name} está inactivo; reactívalo para editar sus artículos.");
    }

    private async Task EnsureUniqueTaxIdAsync(string taxId, Guid? exceptId, CancellationToken ct)
    {
        var normalized = TaxIdRules.Normalize(taxId);
        if (TaxIdRules.GenericTaxIds.Contains(normalized))
            return;
        if (await db.Suppliers.AnyAsync(s => s.TaxId == normalized && s.Id != exceptId, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["taxId"] = [$"Ya existe un proveedor con el RFC {normalized}."],
            });
    }

    private async Task<Supplier> FindAsync(Guid id, CancellationToken ct) =>
        await db.Suppliers.SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw new NotFoundException("el proveedor", id);
}

public static class PurchasingMapping
{
    public static SupplierDto ToDto(this Supplier s) =>
        new(s.Id, s.TaxId, s.Name, s.ContactName, s.Phone, s.Email, s.PaymentTermsDays, s.IsActive, s.Version);
}
