using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Inventory;

/// <summary>
/// RN-45: the stock location a document line posts to. A plant or branch without sub-warehouses posts to itself; with
/// sub-warehouses, the line's warehouse or else the document's is required, must belong to it and be in the caller's
/// stock scope (RN-40).
/// </summary>
public sealed class WarehousePicker
{
    private readonly Location _location;
    private readonly IReadOnlyDictionary<Guid, Location> _warehouses;
    private readonly ILocationScope _scope;

    private WarehousePicker(Location location, IReadOnlyDictionary<Guid, Location> warehouses, ILocationScope scope)
    {
        _location = location;
        _warehouses = warehouses;
        _scope = scope;
    }

    public static async Task<WarehousePicker> LoadAsync(IAppDbContext db, ILocationScope scope, Guid locationId, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        var warehouses = await db.Locations.AsNoTracking().Where(l => l.ParentLocationId == locationId && l.IsActive)
            .ToDictionaryAsync(l => l.Id, ct);
        return new WarehousePicker(location, warehouses, scope);
    }

    public bool HasWarehouses => _warehouses.Count > 0;

    /// <summary>Code of a resolved stock location (the location itself or one of its sub-warehouses).</summary>
    public string CodeOf(Guid stockLocationId) =>
        stockLocationId == _location.Id ? _location.Code : _warehouses[stockLocationId].Code;

    /// <param name="documentWarehouseId">The warehouse chosen for the whole document.</param>
    /// <param name="lineWarehouseId">The line's own choice, which wins.</param>
    public Guid Resolve(Guid? documentWarehouseId, Guid? lineWarehouseId)
    {
        var chosen = lineWarehouseId ?? documentWarehouseId;
        if (!HasWarehouses)
        {
            if (chosen is { } other && other != _location.Id)
                throw new BusinessRuleException("warehouse_not_of_location", $"{_location.Code} no tiene subalmacenes.");
            _scope.EnsureStockAccess(_location.Id);
            return _location.Id;
        }

        if (chosen is not { } warehouseId)
            throw new BusinessRuleException("warehouse_required", $"{_location.Code} tiene subalmacenes: elige el subalmacén (RN-45).");
        if (!_warehouses.ContainsKey(warehouseId))
            throw new BusinessRuleException("warehouse_not_of_location",
                $"El subalmacén indicado no es un subalmacén activo de {_location.Code}.");
        _scope.EnsureStockAccess(warehouseId);
        return warehouseId;
    }
}
