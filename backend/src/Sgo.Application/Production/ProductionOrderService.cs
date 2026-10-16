using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Production;

namespace Sgo.Application.Production;

public sealed record CreateProductionOrderRequest(Guid LocationId, Guid OutputItemId, decimal PlannedQty, DateOnly ScheduledDate, string? Notes);

public sealed record UpdateProductionOrderRequest(uint Version, decimal PlannedQty, DateOnly ScheduledDate, string? Notes);

public sealed record CompleteLineRequest(Guid ComponentItemId, decimal? ActualQty, IReadOnlyList<ComponentLotInput>? Lots);

/// <param name="Lines">Optional per component; omitted components consume their theoretical quantity for ProducedQty (FEFO).</param>
public sealed record CompleteProductionOrderRequest(uint Version, decimal ProducedQty, IReadOnlyList<CompleteLineRequest>? Lines);

public sealed record ProductionOrderListQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public ProductionOrderStatus? Status { get; init; }
    public Guid? OutputItemId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public sealed record ProductionOrderListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid OutputItemId, string OutputSku, string OutputName,
    decimal PlannedQty, decimal? ProducedQty, DateOnly ScheduledDate, ProductionOrderStatus Status, decimal? UnitCost, DateTimeOffset CreatedAt);

public sealed record LineLotDto(Guid LotId, string LotNumber, DateOnly? ExpirationDate, decimal Quantity);

/// <param name="WasteQty">RN-13: actual − theoretical for the produced quantity.</param>
public sealed record ProductionOrderLineDto(
    Guid Id, Guid ComponentItemId, string Sku, string Name, string BaseUomCode, decimal TheoreticalQty, decimal? TheoreticalProducedQty,
    decimal? ActualQty, decimal? WasteQty, decimal? WasteCost, decimal? UnitCost, decimal? TotalCost, IReadOnlyList<LineLotDto> Lots);

public sealed record ProductionOrderDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid RecipeId, int RecipeVersion,
    Guid OutputItemId, string OutputSku, string OutputName, string OutputUomCode, bool OutputTracksLots,
    decimal PlannedQty, decimal? ProducedQty, DateOnly ScheduledDate, ProductionOrderStatus Status, string? Notes,
    DateTimeOffset? ReleasedAt, Guid? OutputLotId, string? OutputLotNumber, DateOnly? OutputLotExpiration,
    decimal? UnitCost, decimal? TotalCost, decimal? TotalWasteCost, DateTimeOffset? CompletedAt, Guid? CompletedBy,
    string? CompletedByName, IReadOnlyList<ProductionOrderLineDto> Lines, DateTimeOffset CreatedAt, Guid? CreatedBy,
    string? CreatedByName, uint Version);

public sealed class CreateProductionOrderRequestValidator : AbstractValidator<CreateProductionOrderRequest>
{
    public CreateProductionOrderRequestValidator()
    {
        RuleFor(x => x.PlannedQty).GreaterThan(0).WithName("Cantidad planeada")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
    }
}

public sealed class UpdateProductionOrderRequestValidator : AbstractValidator<UpdateProductionOrderRequest>
{
    public UpdateProductionOrderRequestValidator()
    {
        RuleFor(x => x.PlannedQty).GreaterThan(0).WithName("Cantidad planeada")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
    }
}

public sealed class CompleteProductionOrderRequestValidator : AbstractValidator<CompleteProductionOrderRequest>
{
    public CompleteProductionOrderRequestValidator()
    {
        RuleFor(x => x.ProducedQty).GreaterThan(0).WithName("Cantidad producida")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleForEach(x => x.Lines).ChildRules(line =>
            line.RuleFor(l => l.ActualQty).GreaterThanOrEqualTo(0).When(l => l.ActualQty is not null).WithName("Consumo real"));
    }
}

public interface IProductionOrderService
{
    Task<PagedResult<ProductionOrderListItemDto>> ListAsync(ProductionOrderListQuery query, CancellationToken ct = default);
    Task<ProductionOrderDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>Uses the item's active recipe and marks it as used (RN-10). Only factory or commissary (RN-14).</summary>
    Task<ProductionOrderDto> CreateAsync(CreateProductionOrderRequest request, CancellationToken ct = default);

    Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default);
    Task<ProductionOrderDto> ReleaseAsync(Guid id, uint version, CancellationToken ct = default);
    Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-12 in one transaction: component exits (FEFO), output entry with a new lot, unit cost.</summary>
    Task<ProductionOrderDto> CompleteAsync(Guid id, CompleteProductionOrderRequest request, CancellationToken ct = default);
}

public sealed class ProductionOrderService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    ILotRegistry lots,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IProductionOrderService
{
    private static readonly Dictionary<string, Expression<Func<ProductionOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["scheduledDate"] = o => o.ScheduledDate,
        ["createdAt"] = o => o.CreatedAt,
        ["status"] = o => o.Status,
    };

    public async Task<PagedResult<ProductionOrderListItemDto>> ListAsync(ProductionOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.ProductionOrders.AsNoTracking().Where(o => allowed.Contains(o.LocationId));
        if (query.LocationId is { } locationId)
            orders = orders.Where(o => o.LocationId == locationId);
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.OutputItemId is { } itemId)
            orders = orders.Where(o => o.OutputItemId == itemId);
        if (query.From is { } from)
            orders = orders.Where(o => o.ScheduledDate >= from);
        if (query.To is { } to)
            orders = orders.Where(o => o.ScheduledDate <= to);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term));

        var page = await orders.ApplySort(query.Sort, SortColumns, "scheduledDate:desc").ToPagedResultAsync(query, ct);
        var itemIds = page.Items.Select(o => o.OutputItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var locationIds = page.Items.Select(o => o.LocationId).Distinct().ToList();
        var codes = await db.Locations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return new PagedResult<ProductionOrderListItemDto>(page.Items.Select(o => new ProductionOrderListItemDto(o.Id, o.Folio, o.LocationId,
                codes[o.LocationId], o.OutputItemId, items[o.OutputItemId].Sku, items[o.OutputItemId].Name, o.PlannedQty, o.ProducedQty,
                o.ScheduledDate, o.Status, o.UnitCost, o.CreatedAt)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<ProductionOrderDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<ProductionOrderDto> CreateAsync(CreateProductionOrderRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.LocationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.LocationId, ct)
                       ?? throw new NotFoundException("la ubicación", request.LocationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        if (!location.CanProduce)
            throw new BusinessRuleException("production_location", "Solo se produce en fábrica o comisariato (RN-14).");

        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == request.OutputItemId, ct)
                   ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["outputItemId"] = ["El artículo no existe."] });
        if (!item.IsActive)
            throw new BusinessRuleException("item_inactive", $"El artículo {item.Sku} está inactivo.");
        var recipe = await db.Recipes.Include(r => r.Lines).SingleOrDefaultAsync(r => r.OutputItemId == item.Id && r.IsActive, ct)
                     ?? throw new BusinessRuleException("production_without_recipe", $"{item.Sku} no tiene receta activa.");

        var order = new ProductionOrder(await folios.NextAsync(DocType.ProductionOrder, ct), location.Id, recipe,
            request.PlannedQty, request.ScheduledDate, request.Notes);
        recipe.MarkUsed(); // RN-10: from now on, editing the recipe creates a new version
        db.ProductionOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> UpdateAsync(Guid id, UpdateProductionOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        order.UpdateDraft(await RecipeOfAsync(order, ct), request.PlannedQty, request.ScheduledDate, request.Notes);
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> ReleaseAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        order.Release(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        order.Cancel();
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<ProductionOrderDto> CompleteAsync(Guid id, CompleteProductionOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        var recipe = await RecipeOfAsync(order, ct);
        var output = await db.Items.AsNoTracking().SingleAsync(i => i.Id == order.OutputItemId, ct);
        var inputs = (request.Lines ?? []).Select(l => new ComponentConsumptionInput(l.ComponentItemId, l.ActualQty, l.Lots)).ToList();

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Claim the order first: a concurrent completion waits on this row and then fails its version check (409).
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);

        // RN-12.1: real consumption, FEFO unless lots were chosen.
        var consumption = await posting.PostAsync(order.ConsumptionRequests(recipe, request.ProducedQty, inputs), ct);

        // RN-12.2: the output lot is the order folio; it expires on completion date + shelf life.
        Guid? outputLotId = null;
        if (output.TracksLots)
        {
            var expiration = output.ShelfLifeDays is { } days ? clock.BusinessDate().AddDays(days) : (DateOnly?)null;
            outputLotId = (await lots.GetOrCreateAsync(output.Id, order.Folio, expiration, ProductionOrder.DocType, order.Id, ct)).Id;
        }

        // RN-12.3: unit cost = consumed cost / produced quantity; the product enters at that cost.
        var outputRequest = order.Complete(recipe, request.ProducedQty, consumption, outputLotId, clock.UtcNow, currentUser.UserId);
        await posting.PostAsync([outputRequest], ct);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    private async Task<Recipe> RecipeOfAsync(ProductionOrder order, CancellationToken ct) =>
        await db.Recipes.AsNoTracking().Include(r => r.Lines).SingleAsync(r => r.Id == order.RecipeId, ct);

    private async Task<ProductionOrder> FindAsync(Guid id, CancellationToken ct)
    {
        var order = await db.ProductionOrders.Include(o => o.Lines).ThenInclude(l => l.Lots).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("la orden de producción", id);
        scope.EnsureAccess(order.LocationId);
        return order;
    }

    private async Task<ProductionOrderDto> ToDtoAsync(ProductionOrder o, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == o.LocationId).Select(l => l.Code).SingleAsync(ct);
        var recipeVersion = await db.Recipes.AsNoTracking().Where(r => r.Id == o.RecipeId).Select(r => r.VersionNumber).SingleAsync(ct);
        var itemIds = o.Lines.Select(l => l.ComponentItemId).Append(o.OutputItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, i.TracksLots, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var lotIds = o.Lines.SelectMany(l => l.Lots).Select(l => l.LotId).Concat(o.OutputLotId is { } lid ? [lid] : []).Distinct().ToList();
        var lotInfo = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);
        foreach (var local in db.Lots.Local.Where(l => lotIds.Contains(l.Id) && !lotInfo.ContainsKey(l.Id)))
            lotInfo[local.Id] = local;

        var lines = o.Lines.Select(l =>
        {
            var c = items[l.ComponentItemId];
            decimal? wasteCost = l.WasteQty is { } waste && l.UnitCost is { } cost ? InventoryMath.Round(waste * cost) : null;
            return new ProductionOrderLineDto(l.Id, l.ComponentItemId, c.Sku, c.Name, c.Uom, l.TheoreticalQty, l.TheoreticalProducedQty,
                l.ActualQty, l.WasteQty, wasteCost, l.UnitCost, l.TotalCost,
                l.Lots.Select(x => new LineLotDto(x.LotId, lotInfo[x.LotId].LotNumber, lotInfo[x.LotId].ExpirationDate, x.Quantity))
                    .OrderBy(x => x.ExpirationDate).ToList());
        }).OrderBy(l => l.Sku).ToList();

        var output = items[o.OutputItemId];
        var outputLot = o.OutputLotId is { } outputLotId ? lotInfo[outputLotId] : null;
        var users = await userDirectory.GetNamesAsync([o.CompletedBy, o.CreatedBy], ct);
        return new ProductionOrderDto(o.Id, o.Folio, o.LocationId, location, o.RecipeId, recipeVersion, o.OutputItemId, output.Sku, output.Name,
            output.Uom, output.TracksLots, o.PlannedQty, o.ProducedQty, o.ScheduledDate, o.Status, o.Notes, o.ReleasedAt,
            o.OutputLotId, outputLot?.LotNumber, outputLot?.ExpirationDate, o.UnitCost,
            o.Status == ProductionOrderStatus.Completed ? lines.Sum(l => l.TotalCost ?? 0) : null,
            o.Status == ProductionOrderStatus.Completed ? lines.Sum(l => l.WasteCost ?? 0) : null,
            o.CompletedAt, o.CompletedBy, users.Of(o.CompletedBy), lines, o.CreatedAt, o.CreatedBy, users.Of(o.CreatedBy), o.Version);
    }
}
