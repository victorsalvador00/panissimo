using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Sales;

// Customers

/// <summary>q searches code, name or RFC.</summary>
public sealed record CustomerListQuery : CatalogListQuery;

public sealed record CustomerListItemDto(
    Guid Id, string Code, string Name, string? TaxId, string? ContactName, string? Phone, int DeliveryPointCount, bool IsActive);

public sealed record CustomerDto(
    Guid Id, string Code, string Name, string? TaxId, string? ContactName, string? Phone, string? Email, string? Notes, bool IsActive,
    DateTimeOffset CreatedAt, string? CreatedByName, DateTimeOffset? UpdatedAt, string? UpdatedByName, uint Version);

public sealed record CustomerLookupQuery
{
    public const int MaxResults = 50;

    /// <summary>Code, name or RFC (contains).</summary>
    public string? Q { get; init; }

    /// <summary>One specific customer (e.g. the one of an existing order), even if inactive.</summary>
    public Guid? Id { get; init; }
    public int Limit { get; init; } = 20;
}

public sealed record CustomerLookupDto(Guid Id, string Code, string Name, bool IsActive);

public interface ICustomerFields
{
    string Name { get; }
    string? TaxId { get; }
    string? ContactName { get; }
    string? Phone { get; }
    string? Email { get; }
    string? Notes { get; }
}

public sealed record CreateCustomerRequest(string Code, string Name, string? TaxId, string? ContactName, string? Phone, string? Email, string? Notes)
    : ICustomerFields
{
    public CustomerDefinition ToDefinition() => new(Name, TaxId, ContactName, Phone, Email, Notes);
}

/// <summary>The code is fixed once created.</summary>
public sealed record UpdateCustomerRequest(
    uint Version, string Name, string? TaxId, string? ContactName, string? Phone, string? Email, string? Notes, bool IsActive) : ICustomerFields
{
    public CustomerDefinition ToDefinition() => new(Name, TaxId, ContactName, Phone, Email, Notes);
}

// Delivery points

public sealed record DeliveryPointListQuery
{
    public bool IncludeInactive { get; init; }
}

public sealed record DeliveryPointDto(Guid Id, Guid CustomerId, string Name, string? Address, bool IsActive, uint Version);

public sealed record CreateDeliveryPointRequest(string Name, string? Address);

public sealed record UpdateDeliveryPointRequest(uint Version, string Name, string? Address, bool IsActive);

// Customer items

public sealed record CustomerItemListQuery
{
    public bool IncludeInactive { get; init; }
}

public sealed record CustomerItemDto(
    Guid Id, Guid CustomerId, Guid ItemId, string ItemSku, string ItemName, string UomCode, bool ItemIsActive, string? CustomerSku,
    decimal? Price, bool IsActive, uint Version);

/// <param name="Price">Without VAT, informative (D-06).</param>
public sealed record CreateCustomerItemRequest(Guid ItemId, string? CustomerSku, decimal? Price);

public sealed record UpdateCustomerItemRequest(uint Version, string? CustomerSku, decimal? Price, bool IsActive);

// Validators

public sealed class CustomerFieldsValidator : AbstractValidator<ICustomerFields>
{
    public CustomerFieldsValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(CustomerRules.NameMaxLength).WithName("Nombre");
        RuleFor(x => x.TaxId).Must(t => TaxIdRules.IsValid(TaxIdRules.Normalize(t!))).WithMessage(TaxIdRules.InvalidMessage)
            .When(x => !string.IsNullOrWhiteSpace(x.TaxId));
        RuleFor(x => x.ContactName).MaximumLength(CustomerRules.ContactNameMaxLength).WithName("Contacto");
        RuleFor(x => x.Phone).MaximumLength(CustomerRules.PhoneMaxLength).WithName("Teléfono");
        RuleFor(x => x.Email).EmailAddress().MaximumLength(CustomerRules.EmailMaxLength).WithName("Correo")
            .When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Notes).MaximumLength(CustomerRules.NotesMaxLength).WithName("Notas");
    }
}

public sealed class CreateCustomerRequestValidator : AbstractValidator<CreateCustomerRequest>
{
    public CreateCustomerRequestValidator()
    {
        RuleFor(x => x.Code).Cascade(CascadeMode.Stop).NotEmpty().WithName("Código")
            .Must(c => CustomerRules.IsValidCode(CustomerRules.NormalizeCode(c)))
            .WithMessage($"El código solo admite letras, números y guion, máximo {CustomerRules.CodeMaxLength} caracteres (ej. CLI-001).");
        Include(new CustomerFieldsValidator());
    }
}

public sealed class UpdateCustomerRequestValidator : AbstractValidator<UpdateCustomerRequest>
{
    public UpdateCustomerRequestValidator() => Include(new CustomerFieldsValidator());
}

public sealed class CreateDeliveryPointRequestValidator : AbstractValidator<CreateDeliveryPointRequest>
{
    public CreateDeliveryPointRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(CustomerRules.DeliveryPointNameMaxLength).WithName("Nombre");
        RuleFor(x => x.Address).MaximumLength(CustomerRules.AddressMaxLength).WithName("Dirección");
    }
}

public sealed class UpdateDeliveryPointRequestValidator : AbstractValidator<UpdateDeliveryPointRequest>
{
    public UpdateDeliveryPointRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(CustomerRules.DeliveryPointNameMaxLength).WithName("Nombre");
        RuleFor(x => x.Address).MaximumLength(CustomerRules.AddressMaxLength).WithName("Dirección");
    }
}

public sealed class CreateCustomerItemRequestValidator : AbstractValidator<CreateCustomerItemRequest>
{
    public CreateCustomerItemRequestValidator()
    {
        RuleFor(x => x.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(x => x.CustomerSku).MaximumLength(CustomerRules.CustomerSkuMaxLength).WithName("Clave del cliente");
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => p is null || decimal.Round(p.Value, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
    }
}

public sealed class UpdateCustomerItemRequestValidator : AbstractValidator<UpdateCustomerItemRequest>
{
    public UpdateCustomerItemRequestValidator()
    {
        RuleFor(x => x.CustomerSku).MaximumLength(CustomerRules.CustomerSkuMaxLength).WithName("Clave del cliente");
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => p is null || decimal.Round(p.Value, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
    }
}

public interface ICustomerService
{
    Task<PagedResult<CustomerListItemDto>> ListAsync(CustomerListQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<CustomerLookupDto>> LookupAsync(CustomerLookupQuery query, CancellationToken ct = default);
    Task<CustomerDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<CustomerDto> CreateAsync(CreateCustomerRequest request, CancellationToken ct = default);
    Task<CustomerDto> UpdateAsync(Guid id, UpdateCustomerRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<DeliveryPointDto>> ListDeliveryPointsAsync(Guid customerId, DeliveryPointListQuery query, CancellationToken ct = default);
    Task<DeliveryPointDto> AddDeliveryPointAsync(Guid customerId, CreateDeliveryPointRequest request, CancellationToken ct = default);
    Task<DeliveryPointDto> UpdateDeliveryPointAsync(Guid customerId, Guid pointId, UpdateDeliveryPointRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<CustomerItemDto>> ListItemsAsync(Guid customerId, CustomerItemListQuery query, CancellationToken ct = default);
    Task<CustomerItemDto> AddItemAsync(Guid customerId, CreateCustomerItemRequest request, CancellationToken ct = default);
    Task<CustomerItemDto> UpdateItemAsync(Guid customerId, Guid customerItemId, UpdateCustomerItemRequest request, CancellationToken ct = default);
}

/// <summary>Customers, their delivery points and the packaged items they buy. A global catalog: no location scope.</summary>
public sealed class CustomerService(IAppDbContext db, IUserDirectory userDirectory) : ICustomerService
{
    private static readonly Dictionary<string, Expression<Func<Customer, object?>>> SortColumns = new()
    {
        ["code"] = c => c.Code,
        ["name"] = c => c.Name,
    };

    public async Task<PagedResult<CustomerListItemDto>> ListAsync(CustomerListQuery query, CancellationToken ct = default)
    {
        var customers = db.Customers.AsNoTracking();
        if (!query.IncludeInactive)
            customers = customers.Where(c => c.IsActive);
        if (query.SearchTerm() is { } term)
            customers = customers.Where(c => c.Code.ToLower().Contains(term) || c.Name.ToLower().Contains(term)
                                             || (c.TaxId != null && c.TaxId.ToLower().Contains(term)));

        var page = await customers.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(c => c.Id).ToList();
        var points = await db.CustomerDeliveryPoints.Where(p => ids.Contains(p.CustomerId) && p.IsActive)
            .GroupBy(p => p.CustomerId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return new PagedResult<CustomerListItemDto>(page.Items.Select(c => new CustomerListItemDto(c.Id, c.Code, c.Name, c.TaxId,
            c.ContactName, c.Phone, points.GetValueOrDefault(c.Id), c.IsActive)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<IReadOnlyList<CustomerLookupDto>> LookupAsync(CustomerLookupQuery query, CancellationToken ct = default)
    {
        var customers = db.Customers.AsNoTracking();
        customers = query.Id is { } id ? customers.Where(c => c.Id == id) : customers.Where(c => c.IsActive);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var term = query.Q.Trim().ToLower();
            customers = customers.Where(c => c.Code.ToLower().Contains(term) || c.Name.ToLower().Contains(term)
                                             || (c.TaxId != null && c.TaxId.ToLower().Contains(term)));
        }
        return await customers.OrderBy(c => c.Name).Take(Math.Clamp(query.Limit, 1, CustomerLookupQuery.MaxResults))
            .Select(c => new CustomerLookupDto(c.Id, c.Code, c.Name, c.IsActive)).ToListAsync(ct);
    }

    public async Task<CustomerDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<CustomerDto> CreateAsync(CreateCustomerRequest request, CancellationToken ct = default)
    {
        var code = CustomerRules.NormalizeCode(request.Code);
        var errors = new Dictionary<string, string[]>();
        if (await db.Customers.AnyAsync(c => c.Code == code, ct))
            errors["code"] = [$"El código '{code}' ya existe."];
        if (await TaxIdTakenAsync(request.TaxId, null, ct) is { } taken)
            errors["taxId"] = [taken];
        if (errors.Count > 0)
            throw new RequestValidationException(errors);

        var customer = new Customer(code, request.ToDefinition());
        db.Customers.Add(customer);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(customer, ct);
    }

    public async Task<CustomerDto> UpdateAsync(Guid id, UpdateCustomerRequest request, CancellationToken ct = default)
    {
        var customer = await FindAsync(id, ct);
        db.EnsureVersion(customer, request.Version);
        if (await TaxIdTakenAsync(request.TaxId, id, ct) is { } taken)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["taxId"] = [taken] });

        customer.Update(request.ToDefinition());
        if (request.IsActive) customer.Activate(); else customer.Deactivate();
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(customer, ct);
    }

    public async Task<IReadOnlyList<DeliveryPointDto>> ListDeliveryPointsAsync(Guid customerId, DeliveryPointListQuery query, CancellationToken ct = default)
    {
        await FindAsync(customerId, ct);
        var points = db.CustomerDeliveryPoints.AsNoTracking().Where(p => p.CustomerId == customerId);
        if (!query.IncludeInactive)
            points = points.Where(p => p.IsActive);
        return await points.OrderBy(p => p.Name).Select(p => new DeliveryPointDto(p.Id, p.CustomerId, p.Name, p.Address, p.IsActive, p.Version))
            .ToListAsync(ct);
    }

    public async Task<DeliveryPointDto> AddDeliveryPointAsync(Guid customerId, CreateDeliveryPointRequest request, CancellationToken ct = default)
    {
        await FindAsync(customerId, ct);
        var point = new CustomerDeliveryPoint(customerId, request.Name, request.Address);
        db.CustomerDeliveryPoints.Add(point);
        await db.SaveChangesAsync(ct);
        return ToDto(point);
    }

    public async Task<DeliveryPointDto> UpdateDeliveryPointAsync(
        Guid customerId, Guid pointId, UpdateDeliveryPointRequest request, CancellationToken ct = default)
    {
        var point = await db.CustomerDeliveryPoints.SingleOrDefaultAsync(p => p.Id == pointId && p.CustomerId == customerId, ct)
                    ?? throw new NotFoundException("el punto de entrega", pointId);
        db.EnsureVersion(point, request.Version);
        point.Update(request.Name, request.Address);
        if (request.IsActive) point.Activate(); else point.Deactivate();
        await db.SaveChangesAsync(ct);
        return ToDto(point);
    }

    public async Task<IReadOnlyList<CustomerItemDto>> ListItemsAsync(Guid customerId, CustomerItemListQuery query, CancellationToken ct = default)
    {
        await FindAsync(customerId, ct);
        var rows = db.CustomerItems.AsNoTracking().Where(r => r.CustomerId == customerId);
        if (!query.IncludeInactive)
            rows = rows.Where(r => r.IsActive);
        return await ProjectItems(rows).ToListAsync(ct);
    }

    public async Task<CustomerItemDto> AddItemAsync(Guid customerId, CreateCustomerItemRequest request, CancellationToken ct = default)
    {
        var customer = await FindAsync(customerId, ct);
        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.ItemId, ct);
        if (item is null || !item.IsActive)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["itemId"] = ["El artículo no existe o está inactivo."] });
        if (!CustomerRules.IsSellable(item.Type, item.Presentation))
            throw new BusinessRuleException("customer_item_not_packaged",
                $"{item.Sku} no se vende a clientes: solo los productos terminados empaquetados (D-05).");
        if (await db.CustomerItems.AnyAsync(r => r.CustomerId == customerId && r.ItemId == item.Id, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["itemId"] = [$"{customer.Name} ya tiene {item.Sku} en sus artículos; edítalo o reactívalo."] });

        var row = new CustomerItem(customerId, item.Id, request.CustomerSku, request.Price);
        db.CustomerItems.Add(row);
        await db.SaveChangesAsync(ct);
        return await ProjectItems(db.CustomerItems.AsNoTracking().Where(r => r.Id == row.Id)).SingleAsync(ct);
    }

    public async Task<CustomerItemDto> UpdateItemAsync(
        Guid customerId, Guid customerItemId, UpdateCustomerItemRequest request, CancellationToken ct = default)
    {
        var row = await db.CustomerItems.SingleOrDefaultAsync(r => r.Id == customerItemId && r.CustomerId == customerId, ct)
                  ?? throw new NotFoundException("el artículo del cliente", customerItemId);
        db.EnsureVersion(row, request.Version);
        row.Update(request.CustomerSku, request.Price);
        if (request.IsActive) row.Activate(); else row.Deactivate();
        await db.SaveChangesAsync(ct);
        return await ProjectItems(db.CustomerItems.AsNoTracking().Where(r => r.Id == row.Id)).SingleAsync(ct);
    }

    /// <summary>The RFC is optional; when present it is unique among customers except the generic ones (RN-35 rules).</summary>
    private async Task<string?> TaxIdTakenAsync(string? taxId, Guid? currentId, CancellationToken ct)
    {
        var normalized = CustomerRules.NormalizeTaxId(taxId);
        if (normalized is null || TaxIdRules.IsGeneric(normalized))
            return null;
        return await db.Customers.AnyAsync(c => c.TaxId == normalized && c.Id != currentId, ct)
            ? $"Ya existe un cliente con el RFC {normalized}."
            : null;
    }

    private IQueryable<CustomerItemDto> ProjectItems(IQueryable<CustomerItem> rows) =>
        from r in rows
        join i in db.Items on r.ItemId equals i.Id
        join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
        orderby i.Sku
        select new CustomerItemDto(r.Id, r.CustomerId, r.ItemId, i.Sku, i.Name, u.Code, i.IsActive, r.CustomerSku, r.Price, r.IsActive, r.Version);

    private static DeliveryPointDto ToDto(CustomerDeliveryPoint p) => new(p.Id, p.CustomerId, p.Name, p.Address, p.IsActive, p.Version);

    private async Task<CustomerDto> ToDtoAsync(Customer c, CancellationToken ct)
    {
        var names = await userDirectory.GetNamesAsync([c.CreatedBy, c.UpdatedBy], ct);
        return new CustomerDto(c.Id, c.Code, c.Name, c.TaxId, c.ContactName, c.Phone, c.Email, c.Notes, c.IsActive, c.CreatedAt,
            names.Of(c.CreatedBy), c.UpdatedAt, names.Of(c.UpdatedBy), c.Version);
    }

    private async Task<Customer> FindAsync(Guid id, CancellationToken ct) =>
        await db.Customers.SingleOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException("el cliente", id);
}
