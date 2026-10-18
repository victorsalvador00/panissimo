using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Inventory;

/// <summary>Trazabilidad de lotes (RN-100..RN-109): hacia atrás hasta proveedores y hacia adelante hasta sucursales y clientes.</summary>
[ApiController]
[Route("traceability")]
[Tags("Trazabilidad")]
[RequirePermission(Permissions.InventoryTraceability)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class TraceabilityController(ITraceabilityService traceability) : ControllerBase
{
    /// <summary>
    /// Cadena de un lote, una OC, una OP, un traspaso o una remisión: nodos (proveedores, recepciones, lotes, cierres, existencia
    /// por ubicación, traspasos, remisiones y clientes), aristas con cantidades y fechas, OP como grupos, bitácora y resumen
    /// de retiro (RN-108). Dirección por omisión según la entrada (RN-100); maxDepth de 1 a 20 (10 por omisión). Cruza
    /// ubicaciones: no se limita al alcance del usuario; cada consulta queda en la bitácora (RN-109). Los costos llegan en
    /// null sin production.view y los precios de compra sin purchasing.view.
    /// </summary>
    [HttpGet("graph")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<TraceGraphDto> Graph([FromQuery] TraceQuery query, CancellationToken ct) => traceability.GetGraphAsync(query, ct);

    /// <summary>Lotes por número, SKU o nombre del artículo (máximo 50), los más recientes primero.</summary>
    [HttpGet("lots/lookup")]
    public Task<IReadOnlyList<TraceLotLookupDto>> Lots([FromQuery] TraceLotLookupQuery query, CancellationToken ct) =>
        traceability.LotsAsync(query, ct);

    /// <summary>Puntos de entrada por folio (OC-, OP-, TR-, RM-) o número de lote: { sourceType, sourceId, label }.</summary>
    [HttpGet("sources/lookup")]
    public Task<IReadOnlyList<TraceSourceDto>> Sources([FromQuery] string? q, CancellationToken ct) => traceability.SourcesAsync(q, ct);
}
