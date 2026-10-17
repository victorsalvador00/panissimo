using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

public interface ISupplierService
{
    Task<PagedResult<SupplierListItemDto>> ListAsync(SupplierListQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<SupplierLookupDto>> LookupAsync(SupplierLookupQuery query, CancellationToken ct = default);
    Task<SupplierDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<SupplierDto> CreateAsync(CreateSupplierRequest request, CancellationToken ct = default);
    Task<SupplierDto> UpdateAsync(Guid id, UpdateSupplierRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<SupplierItemDto>> ListItemsAsync(Guid supplierId, SupplierItemListQuery query, CancellationToken ct = default);
    Task<SupplierItemDto> AddItemAsync(Guid supplierId, CreateSupplierItemRequest request, CancellationToken ct = default);
    Task<SupplierItemDto> UpdateItemAsync(Guid supplierId, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<SupplierOfferDto>> GetOffersAsync(Guid itemId, CancellationToken ct = default);
}

/// <summary>
/// Suppliers and the items they sell (RN-35). Suppliers are a global catalog: no location scope.
/// Every write to a supplier's items holds the supplier lock, and changing an item's preferred supplier also holds
/// the item lock (always in that order), so a parallel mark or a deactivation waits and then sees the other's commit.
/// </summary>
public sealed class SupplierService(IAppDbContext db, ITransactionLocks locks, IUserDirectory userDirectory) : ISupplierService
{
    private static readonly Dictionary<string, Expression<Func<Supplier, object?>>> SortColumns = new()
    {
        ["name"] = s => s.Name,
        ["taxId"] = s => s.TaxId,
        ["paymentTermsDays"] = s => s.PaymentTermsDays,
    };

    public async Task<PagedResult<SupplierListItemDto>> ListAsync(SupplierListQuery query, CancellationToken ct = default)
    {
        var suppliers = db.Suppliers.AsNoTracking();
        if (!query.IncludeInactive)
            suppliers = suppliers.Where(s => s.IsActive);
        if (query.SearchTerm() is { } term)
            suppliers = suppliers.Where(s => s.Name.ToLower().Contains(term) || s.TaxId.ToLower().Contains(term));

        var page = await suppliers.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, ct);

        var ids = page.Items.Select(s => s.Id).ToList();
        var counts = await db.SupplierItems.Where(i => ids.Contains(i.SupplierId) && i.IsActive)
            .GroupBy(i => i.SupplierId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, ct);

        return new PagedResult<SupplierListItemDto>(
            page.Items.Select(s => new SupplierListItemDto(s.Id, s.TaxId, s.Name, s.ContactName, s.Phone, s.Email,
                s.PaymentTermsDays, counts.GetValueOrDefault(s.Id), s.IsActive)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<IReadOnlyList<SupplierLookupDto>> LookupAsync(SupplierLookupQuery query, CancellationToken ct = default)
    {
        var suppliers = db.Suppliers.AsNoTracking();
        suppliers = query.Id is { } id ? suppliers.Where(s => s.Id == id) : suppliers.Where(s => s.IsActive);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var term = query.Q.Trim().ToLower();
            suppliers = suppliers.Where(s => s.Name.ToLower().Contains(term) || s.TaxId.ToLower().Contains(term));
        }

        return await suppliers.OrderBy(s => s.Name)
            .Take(Math.Clamp(query.Limit, 1, SupplierLookupQuery.MaxResults))
            .Select(s => new SupplierLookupDto(s.Id, s.TaxId, s.Name, s.PaymentTermsDays, s.IsActive))
            .ToListAsync(ct);
    }

    public async Task<SupplierDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<SupplierDto> CreateAsync(CreateSupplierRequest request, CancellationToken ct = default)
    {
        var definition = request.ToDefinition();
        await EnsureUniqueTaxIdAsync(definition.TaxId, null, ct);

        var supplier = new Supplier(definition);
        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(supplier, ct);
    }

    public async Task<SupplierDto> UpdateAsync(Guid id, UpdateSupplierRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await locks.AcquireAsync(TransactionLockScopes.Supplier, id.ToString(), ct);

        var supplier = await FindAsync(id, ct);
        db.EnsureVersion(supplier, request.Version);
        var definition = request.ToDefinition();
        await EnsureUniqueTaxIdAsync(definition.TaxId, id, ct);

        supplier.Update(definition);
        if (request.IsActive)
            supplier.Activate();
        else if (supplier.IsActive)
        {
            // RN-35: an inactive supplier keeps its items but loses its preferences.
            supplier.Deactivate();
            foreach (var preferred in await db.SupplierItems.Where(i => i.SupplierId == id && i.IsPreferred).ToListAsync(ct))
                preferred.ClearPreferred();
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(supplier, ct);
    }

    public async Task<IReadOnlyList<SupplierItemDto>> ListItemsAsync(Guid supplierId, SupplierItemListQuery query, CancellationToken ct = default)
    {
        await FindAsync(supplierId, ct);
        var rows = db.SupplierItems.AsNoTracking().Where(i => i.SupplierId == supplierId);
        if (!query.IncludeInactive)
            rows = rows.Where(i => i.IsActive);
        return await ProjectItems(rows).ToListAsync(ct);
    }

    public async Task<SupplierItemDto> AddItemAsync(Guid supplierId, CreateSupplierItemRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var supplier = await LockSupplierAsync(supplierId, ct);
        supplier.EnsureEditable();

        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.ItemId, ct);
        if (item is null || !item.IsActive)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["itemId"] = ["El artículo no existe o está inactivo."] });
        if (!SupplierRules.IsPurchasable(item.Type))
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["itemId"] = [$"{item.Sku} no se compra: solo las materias primas y los insumos tienen proveedor."] });
        if (await db.SupplierItems.AnyAsync(i => i.SupplierId == supplierId && i.ItemId == item.Id, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["itemId"] = [$"{supplier.Name} ya tiene {item.Sku} en su catálogo; edítalo o reactívalo."] });

        var row = new SupplierItem(supplierId, item.Id, request.SupplierSku, request.Price, request.LeadTimeDays);
        db.SupplierItems.Add(row);
        if (request.IsPreferred)
            await MarkPreferredAsync(row, ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetItemDtoAsync(row.Id, ct);
    }

    public async Task<SupplierItemDto> UpdateItemAsync(
        Guid supplierId, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var supplier = await LockSupplierAsync(supplierId, ct);
        supplier.EnsureEditable();

        var row = await db.SupplierItems.SingleOrDefaultAsync(i => i.Id == supplierItemId && i.SupplierId == supplierId, ct)
                  ?? throw new NotFoundException("el artículo del proveedor", supplierItemId);
        db.EnsureVersion(row, request.Version);

        row.Update(request.SupplierSku, request.Price, request.LeadTimeDays);
        if (request.IsActive) row.Activate(); else row.Deactivate();
        if (!request.IsPreferred)
            row.ClearPreferred();
        else if (!row.IsPreferred)
            await MarkPreferredAsync(row, ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await GetItemDtoAsync(row.Id, ct);
    }

    public async Task<IReadOnlyList<SupplierOfferDto>> GetOffersAsync(Guid itemId, CancellationToken ct = default)
    {
        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == itemId, ct)
                   ?? throw new NotFoundException("el artículo", itemId);
        var purchaseUom = item.PurchaseUomId is { } uomId
            ? await db.UnitsOfMeasure.Where(u => u.Id == uomId).Select(u => u.Code).SingleAsync(ct)
            : null;

        var offers = await (from i in db.SupplierItems.AsNoTracking()
                            join s in db.Suppliers on i.SupplierId equals s.Id
                            where i.ItemId == itemId && i.IsActive && s.IsActive
                            select new { Row = i, s.TaxId, s.Name, s.PaymentTermsDays })
            .ToListAsync(ct);

        return offers
            .Select(o => new SupplierOfferDto(o.Row.Id, o.Row.SupplierId, o.TaxId, o.Name, o.PaymentTermsDays, o.Row.SupplierSku,
                purchaseUom, o.Row.Price, PerBaseUnit(o.Row.Price, item.PurchaseToBaseFactor), o.Row.LeadTimeDays, o.Row.IsPreferred))
            .OrderByDescending(o => o.IsPreferred).ThenBy(o => o.PricePerBaseUnit).ThenBy(o => o.SupplierName)
            .ToList();
    }

    /// <summary>Price per base unit, rounded like the rest of the quantities and costs (4 decimals).</summary>
    public static decimal PerBaseUnit(decimal price, decimal purchaseToBaseFactor) =>
        decimal.Round(price / purchaseToBaseFactor, 4, MidpointRounding.AwayFromZero);

    /// <summary>
    /// RN-35: unmarks the item's current preferred row, flushes so the partial unique index never sees two,
    /// then marks <paramref name="row"/>. Runs under the item lock, so a parallel mark waits and then finds this one.
    /// </summary>
    private async Task MarkPreferredAsync(SupplierItem row, CancellationToken ct)
    {
        await locks.AcquireAsync(TransactionLockScopes.PreferredSupplier, row.ItemId.ToString(), ct);
        var previous = await db.SupplierItems.Where(i => i.ItemId == row.ItemId && i.IsPreferred && i.Id != row.Id).ToListAsync(ct);
        if (previous.Count > 0)
        {
            foreach (var other in previous)
                other.ClearPreferred();
            await db.SaveChangesAsync(ct);
        }
        row.MarkPreferred();
    }

    /// <summary>Takes the supplier lock, then loads the supplier so its state is the committed one.</summary>
    private async Task<Supplier> LockSupplierAsync(Guid supplierId, CancellationToken ct)
    {
        await locks.AcquireAsync(TransactionLockScopes.Supplier, supplierId.ToString(), ct);
        return await FindAsync(supplierId, ct);
    }

    /// <summary>RN-35: unique RFC except the generic ones. A race past this check surfaces as 409 duplicate.</summary>
    private async Task EnsureUniqueTaxIdAsync(string taxId, Guid? currentId, CancellationToken ct)
    {
        var normalized = TaxIdRules.Normalize(taxId);
        if (TaxIdRules.IsGeneric(normalized))
            return;
        if (await db.Suppliers.AnyAsync(s => s.TaxId == normalized && s.Id != currentId, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["taxId"] = [$"Ya existe un proveedor con el RFC {normalized}."] });
    }

    private async Task<SupplierItemDto> GetItemDtoAsync(Guid supplierItemId, CancellationToken ct) =>
        await ProjectItems(db.SupplierItems.AsNoTracking().Where(i => i.Id == supplierItemId)).SingleAsync(ct);

    private IQueryable<SupplierItemDto> ProjectItems(IQueryable<SupplierItem> rows) =>
        from r in rows
        join i in db.Items on r.ItemId equals i.Id
        join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
        join p in db.UnitsOfMeasure on i.PurchaseUomId equals p.Id into purchase
        from p in purchase.DefaultIfEmpty()
        orderby i.Sku
        select new SupplierItemDto(r.Id, r.SupplierId, r.ItemId, i.Sku, i.Name, i.Type, i.IsActive, b.Code,
            p == null ? null : p.Code, i.PurchaseToBaseFactor, r.SupplierSku, r.Price,
            PerBaseUnit(r.Price, i.PurchaseToBaseFactor), r.LeadTimeDays, r.IsPreferred, r.IsActive, r.Version);

    private async Task<SupplierDto> ToDtoAsync(Supplier s, CancellationToken ct)
    {
        var names = await userDirectory.GetNamesAsync([s.CreatedBy, s.UpdatedBy], ct);
        return new SupplierDto(s.Id, s.TaxId, s.Name, s.ContactName, s.Phone, s.Email, s.PaymentTermsDays, s.IsActive,
            s.CreatedAt, names.Of(s.CreatedBy), s.UpdatedAt, names.Of(s.UpdatedBy), s.Version);
    }

    private async Task<Supplier> FindAsync(Guid id, CancellationToken ct) =>
        await db.Suppliers.SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw new NotFoundException("el proveedor", id);
}
