using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Production;

[ApiController]
[Route("production-order-imports")]
[Tags("Importación de OP")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionOrderImportsController(IProductionOrderImportService imports) : ControllerBase
{
    public const long ExcelMaxBytes = 5 * 1024 * 1024;
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>Plantilla .xlsx con la hoja OP (fecha, sku, cantidad, area, turno, ubicacion, notas) e instrucciones.</summary>
    [HttpGet("template")]
    [RequirePermission(Permissions.ProductionOrdersImport)]
    [ProducesResponseType<Stream>(StatusCodes.Status200OK, XlsxContentType)]
    public IActionResult Template() => File(imports.Template(), XlsxContentType, "plantilla-ordenes-produccion.xlsx");

    /// <summary>Valida el archivo (RN-90..RN-93) sin guardar nada: errores por fila y columna, avisos y órdenes a crear.</summary>
    [HttpPost("validate")]
    [RequirePermission(Permissions.ProductionOrdersImport)]
    [RequestSizeLimit(ExcelMaxBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ImportPreviewDto> Validate(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await imports.ValidateAsync(stream, file.FileName, ct);
    }

    /// <summary>
    /// Importa (RN-91, RN-94): revalida el archivo y crea las órdenes en una transacción. Errores → 400 con rowErrors; avisos sin
    /// confirmar → 422 import_warnings_not_confirmed. releaseOnImport las crea liberadas (requiere production.orders.manage).
    /// </summary>
    [HttpPost]
    [RequirePermission(Permissions.ProductionOrdersImport)]
    [RequestSizeLimit(ExcelMaxBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ImportResultDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<ImportResultDto>> Create(IFormFile file, [FromForm] bool confirmWarnings, [FromForm] bool releaseOnImport,
        CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var result = await imports.CreateAsync(stream, file.FileName, confirmWarnings, releaseOnImport, ct);
        return CreatedAtAction(nameof(Get), new { id = result.ImportId }, result);
    }

    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    public Task<PagedResult<ProductionOrderImportListItemDto>> List([FromQuery] PageQuery query, CancellationToken ct) =>
        imports.ListAsync(query, ct);

    /// <summary>Importación con sus órdenes.</summary>
    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ProductionOrderImportDto> Get(Guid id, CancellationToken ct) => imports.GetAsync(id, ct);
}
