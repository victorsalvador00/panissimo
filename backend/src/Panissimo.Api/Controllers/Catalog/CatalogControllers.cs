using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Panissimo.Api.Auth;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Common;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Catalog;

[ApiController]
[Route("units-of-measure")]
[Tags("Unidades de medida")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class UnitsOfMeasureController(IUnitOfMeasureService units) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.CatalogView)]
    public Task<PagedResult<UnitOfMeasureDto>> List([FromQuery] CatalogListQuery query, CancellationToken ct) => units.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.CatalogView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<UnitOfMeasureDto> Get(Guid id, CancellationToken ct) => units.GetAsync(id, ct);

    [HttpPost]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<UnitOfMeasureDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<UnitOfMeasureDto>> Create(CreateUnitOfMeasureRequest request, CancellationToken ct)
    {
        var unit = await units.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = unit.Id }, unit);
    }

    /// <summary>Edita nombre, tipo y estado. El código no cambia.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<UnitOfMeasureDto> Update(Guid id, UpdateUnitOfMeasureRequest request, CancellationToken ct) => units.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("item-categories")]
[Tags("Categorías")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemCategoriesController(IItemCategoryService categories) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.CatalogView, Permissions.InventoryView)]
    public Task<PagedResult<ItemCategoryDto>> List([FromQuery] CatalogListQuery query, CancellationToken ct) => categories.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.CatalogView, Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ItemCategoryDto> Get(Guid id, CancellationToken ct) => categories.GetAsync(id, ct);

    [HttpPost]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ItemCategoryDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ItemCategoryDto>> Create(CreateItemCategoryRequest request, CancellationToken ct)
    {
        var category = await categories.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = category.Id }, category);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<ItemCategoryDto> Update(Guid id, UpdateItemCategoryRequest request, CancellationToken ct) => categories.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("production-areas")]
[Tags("Áreas de producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionAreasController(IProductionAreaService areas) : ControllerBase
{
    /// <summary>Áreas (cuadrillas) de la planta, en su orden. Activas por defecto.</summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView, Permissions.CatalogView)]
    public Task<PagedResult<ProductionAreaDto>> List([FromQuery] ProductionAreaListQuery query, CancellationToken ct) => areas.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView, Permissions.CatalogView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ProductionAreaDto> Get(Guid id, CancellationToken ct) => areas.GetAsync(id, ct);

    [HttpPost]
    [RequirePermission(Permissions.ProductionAreasManage)]
    [ProducesResponseType<ProductionAreaDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProductionAreaDto>> Create(CreateProductionAreaRequest request, CancellationToken ct)
    {
        var area = await areas.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = area.Id }, area);
    }

    /// <summary>Edita nombre, orden y estado. El código no cambia.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.ProductionAreasManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<ProductionAreaDto> Update(Guid id, UpdateProductionAreaRequest request, CancellationToken ct) => areas.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("items")]
[Tags("Artículos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemsController(IItemService items) : ControllerBase
{
    /// <summary>Lista paginada. Filtros: q (SKU o nombre), type, presentation, categoryId, areaId, bulkItemId, includeInactive.</summary>
    [HttpGet]
    [RequirePermission(Permissions.CatalogView)]
    public Task<PagedResult<ItemListItemDto>> List([FromQuery] ItemListQuery query, CancellationToken ct) => items.ListAsync(query, ct);

    /// <summary>Búsqueda rápida de artículos activos para los selectores (máximo 50).</summary>
    [HttpGet("lookup")]
    [RequirePermission(Permissions.CatalogView, Permissions.InventoryView, Permissions.LogisticsView, Permissions.ProductionView,
        Permissions.PurchasingView, Permissions.SalesView)]
    public Task<IReadOnlyList<ItemLookupDto>> Lookup([FromQuery] ItemLookupQuery query, CancellationToken ct) => items.LookupAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.CatalogView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ItemDto> Get(Guid id, CancellationToken ct) => items.GetAsync(id, ct);

    [HttpPost]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ItemDto>> Create(CreateItemRequest request, CancellationToken ct)
    {
        var item = await items.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = item.Id }, item);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ItemDto> Update(Guid id, UpdateItemRequest request, CancellationToken ct) => items.UpdateAsync(id, request, ct);

    /// <summary>Mínimo y máximo del artículo en cada ubicación activa de tu alcance.</summary>
    [HttpGet("{id:guid}/location-settings")]
    [RequirePermission(Permissions.CatalogView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<ItemLocationSettingDto>> GetLocationSettings(Guid id, CancellationToken ct) =>
        items.GetLocationSettingsAsync(id, ct);

    /// <summary>Guarda mínimo y máximo por ubicación; ambos vacíos quitan la configuración.</summary>
    [HttpPut("{id:guid}/location-settings")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<ItemLocationSettingDto>> UpdateLocationSettings(
        Guid id, UpdateItemLocationSettingsRequest request, CancellationToken ct) => items.UpdateLocationSettingsAsync(id, request, ct);
}

[ApiController]
[Route("imports")]
[Tags("Importaciones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ImportsController(IItemImportService itemImport) : ControllerBase
{
    public const long CsvMaxBytes = 2 * 1024 * 1024;

    /// <summary>
    /// Importa artículos desde CSV (UTF-8, coma o punto y coma). Todo o nada: con un error no se importa nada y se
    /// devuelven los errores por fila (rowErrors). Un SKU existente se actualiza.
    /// </summary>
    [HttpPost("items")]
    [RequirePermission(Permissions.CatalogManage)]
    [RequestSizeLimit(CsvMaxBytes)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ItemImportResult> Items(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await itemImport.ImportAsync(stream, ct);
    }
}

/// <summary>Foto del artículo (una por artículo; el navegador la redimensiona).</summary>
[ApiController]
[Route("items/{id:guid}/photo")]
[Tags("Artículos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemPhotosController(IItemPhotoService photos) : ControllerBase
{
    /// <summary>Límite de la carga completa (imagen ≤ 300 KB + miniatura ≤ 50 KB + encabezados).</summary>
    public const int MaxRequestBytes = 400 * 1024;

    /// <summary>
    /// La foto (size=full, máx. 512 px) o su miniatura (size=thumbnail, 96 px; por omisión). Responde con ETag
    /// (revisión y tamaño): con If-None-Match vigente, 304 sin cuerpo. 404 si el artículo no tiene foto.
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.CatalogView, Permissions.InventoryView, Permissions.LogisticsView, Permissions.ProductionView,
        Permissions.PurchasingView, Permissions.SalesView)]
    [ProducesResponseType(typeof(Stream), StatusCodes.Status200OK, "image/png", "image/jpeg", "image/webp")]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, [FromQuery] ItemPhotoSize size = ItemPhotoSize.Thumbnail, CancellationToken ct = default)
    {
        var photo = await photos.GetAsync(id, size, ct) ?? throw new NotFoundException("la foto del artículo", id);
        // Private: the photo needs a session; no-cache: the browser keeps it and revalidates with the ETag.
        Response.Headers.CacheControl = "private, no-cache";
        return File(photo.Content, photo.ContentType, lastModified: null,
            new EntityTagHeaderValue($"\"{photo.Revision}-{size.ToString().ToLowerInvariant()}\""));
    }

    /// <summary>
    /// Sube o reemplaza la foto: multipart con `image` (PNG, JPEG o WebP; máx. 512 px por lado y 300 KB) y `thumbnail`
    /// (máx. 96 px y 50 KB). El tipo se lee del archivo, no del nombre. Cambia la revisión.
    /// </summary>
    [HttpPut]
    [RequirePermission(Permissions.CatalogManage)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge)]
    public async Task<ItemPhotoDto> Put(Guid id, IFormFile? image, IFormFile? thumbnail, CancellationToken ct) =>
        await photos.SaveAsync(id, await ReadAsync(image, ct), await ReadAsync(thumbnail, ct), ct);

    /// <summary>Quita la foto del artículo (sin foto no hace nada).</summary>
    [HttpDelete]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await photos.RemoveAsync(id, ct);
        return NoContent();
    }

    private static async Task<PhotoUpload> ReadAsync(IFormFile? file, CancellationToken ct)
    {
        if (file is null)
            return new PhotoUpload([], null);
        using var buffer = new MemoryStream((int)Math.Min(file.Length, MaxRequestBytes));
        await file.CopyToAsync(buffer, ct);
        return new PhotoUpload(buffer.ToArray(), file.ContentType);
    }
}
