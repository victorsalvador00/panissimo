using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Api.Controllers.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Inventory;

[ApiController]
[Tags("Existencias y kardex")]
[RequirePermission(Permissions.InventoryView)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class StockController(IStockQueries stock) : ControllerBase
{
    /// <summary>Existencias por ubicación y artículo con mín/máx y valor. Filtros: locationId, itemId, categoryId, type, belowMin, q.</summary>
    [HttpGet("stock")]
    public Task<PagedResult<StockLevelDto>> List([FromQuery] StockQuery query, CancellationToken ct) => stock.ListAsync(query, ct);

    /// <summary>Existencia por lote (los vencidos se marcan), del que caduca primero al último.</summary>
    [HttpGet("stock/{locationId:guid}/{itemId:guid}/lots")]
    public Task<IReadOnlyList<LotStockDto>> Lots(Guid locationId, Guid itemId, CancellationToken ct) => stock.LotsAsync(locationId, itemId, ct);

    /// <summary>Kardex paginado, del más reciente al más antiguo. Con locationId e itemId incluye el saldo corrido.</summary>
    [HttpGet("movements")]
    public Task<PagedResult<KardexEntryDto>> Movements([FromQuery] MovementQuery query, CancellationToken ct) =>
        stock.MovementsAsync(query, ct);

    /// <summary>RN-07: artículos bajo mínimo y lotes que vencen dentro de inventory.expiry_alert_days.</summary>
    [HttpGet("alerts")]
    public Task<AlertsDto> Alerts([FromQuery] Guid? locationId, CancellationToken ct) => stock.AlertsAsync(locationId, ct);
}

[ApiController]
[Route("adjustments")]
[Tags("Ajustes de inventario")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class AdjustmentsController(IAdjustmentService adjustments) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.InventoryView)]
    public Task<PagedResult<AdjustmentListItemDto>> List([FromQuery] AdjustmentListQuery query, CancellationToken ct) =>
        adjustments.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<AdjustmentDto> Get(Guid id, CancellationToken ct) => adjustments.GetAsync(id, ct);

    /// <summary>
    /// Registra y aplica un ajuste. Corrección admite entradas (con costo, lote y caducidad) y salidas; merma, caducado,
    /// dañado y uso interno solo salidas. 409 insufficient_stock con todos los faltantes si alguna salida no alcanza.
    /// </summary>
    [HttpPost]
    [RequirePermission(Permissions.InventoryAdjust)]
    [ProducesResponseType<AdjustmentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<AdjustmentDto>> Create(CreateAdjustmentRequest request, CancellationToken ct)
    {
        var adjustment = await adjustments.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = adjustment.Id }, adjustment);
    }
}

[ApiController]
[Route("imports")]
[Tags("Importaciones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class InventoryImportsController(IInitialStockImportService initialStock) : ControllerBase
{
    /// <summary>
    /// RN-08: existencias iniciales por CSV (ubicacion, sku, cantidad, costo_unitario, lote, caducidad). Un ajuste de
    /// corrección por ubicación; todo o nada; se rechaza un artículo que ya tiene movimientos en esa ubicación.
    /// </summary>
    [HttpPost("initial-stock")]
    [RequirePermission(Permissions.InventoryAdjust)]
    [RequestSizeLimit(ImportsController.CsvMaxBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<InitialStockImportResult> InitialStock(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await initialStock.ImportAsync(stream, ct);
    }
}
