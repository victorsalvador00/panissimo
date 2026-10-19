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
    /// <summary>Existencias por ubicación y artículo con mín/máx y valor. Filtros: locationId, rowLocationId (solo los renglones del total o de un subalmacén), itemId, categoryId, type, belowMin, q.</summary>
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

[ApiController]
[Route("physical-counts")]
[Tags("Conteos físicos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class PhysicalCountsController(IPhysicalCountService counts) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.InventoryView)]
    public Task<PagedResult<PhysicalCountListItemDto>> List([FromQuery] PhysicalCountListQuery query, CancellationToken ct) =>
        counts.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<PhysicalCountDto> Get(Guid id, CancellationToken ct) => counts.GetAsync(id, ct);

    /// <summary>Crea un conteo en borrador. Con categoryId es un conteo parcial de esa categoría.</summary>
    [HttpPost]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<PhysicalCountDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PhysicalCountDto>> Create(CreatePhysicalCountRequest request, CancellationToken ct)
    {
        var count = await counts.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = count.Id }, count);
    }

    /// <summary>Borrador: categoría y notas. En curso: notas y cantidades contadas (autoguardado con version).</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PhysicalCountDto> Update(Guid id, UpdatePhysicalCountRequest request, CancellationToken ct) =>
        counts.UpdateAsync(id, request, ct);

    /// <summary>Agrega un artículo o lote que no estaba en el snapshot (su existencia se calcula al momento del snapshot).</summary>
    [HttpPost("{id:guid}/lines")]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PhysicalCountDto> AddLine(Guid id, AddCountLineRequest request, CancellationToken ct) =>
        counts.AddLineAsync(id, request, ct);

    /// <summary>Inicia el conteo y toma el snapshot de existencias (RN-06). Solo un conteo en curso por ubicación.</summary>
    [HttpPost("{id:guid}/start")]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PhysicalCountDto> Start(Guid id, VersionRequest request, CancellationToken ct) =>
        counts.StartAsync(id, request.Version, ct);

    /// <summary>Cierra el conteo y registra la diferencia contado − snapshot de cada línea. Todas las líneas deben estar contadas.</summary>
    [HttpPost("{id:guid}/close")]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PhysicalCountDto> Close(Guid id, VersionRequest request, CancellationToken ct) =>
        counts.CloseAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.InventoryCount)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PhysicalCountDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        counts.CancelAsync(id, request.Version, ct);
}

[ApiController]
[Route("consumptions")]
[Tags("Consumos de sucursal")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ConsumptionsController(IConsumptionService consumptions) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.InventoryView)]
    public Task<PagedResult<ConsumptionListItemDto>> List([FromQuery] ConsumptionListQuery query, CancellationToken ct) =>
        consumptions.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ConsumptionDto> Get(Guid id, CancellationToken ct) => consumptions.GetAsync(id, ct);

    /// <summary>RN-09: registra el consumo de una sucursal (hoy o un día anterior) y lo descuenta (FEFO si no se indica lote).</summary>
    [HttpPost]
    [RequirePermission(Permissions.InventoryConsumption)]
    [ProducesResponseType<ConsumptionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<ConsumptionDto>> Create(CreateConsumptionRequest request, CancellationToken ct)
    {
        var entry = await consumptions.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = entry.Id }, entry);
    }
}
