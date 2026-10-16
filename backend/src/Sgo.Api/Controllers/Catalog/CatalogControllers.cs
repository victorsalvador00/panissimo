using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Catalog;

[ApiController]
[Route("units-of-measure")]
[Tags("Catálogos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class UnitsOfMeasureController(IUnitOfMeasureService units) : ControllerBase
{
    /// <summary>Unidades de medida. Activas por defecto; includeInactive=true para ver todas.</summary>
    [HttpGet]
    [RequirePermission(Permissions.CatalogView)]
    public Task<PagedResult<UnitOfMeasureDto>> List([FromQuery] CatalogListQuery query, CancellationToken ct) =>
        units.ListAsync(query, ct);

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
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<UnitOfMeasureDto> Update(Guid id, UpdateUnitOfMeasureRequest request, CancellationToken ct) =>
        units.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("item-categories")]
[Tags("Catálogos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemCategoriesController(IItemCategoryService categories) : ControllerBase
{
    /// <summary>
    /// Categorías de artículo. Activas por defecto; includeInactive=true para ver todas. También con inventory.view:
    /// los conteos físicos parciales se hacen por categoría.
    /// </summary>
    [HttpGet]
    [RequireAnyPermission(Permissions.CatalogView, Permissions.InventoryView)]
    public Task<PagedResult<ItemCategoryDto>> List([FromQuery] CatalogListQuery query, CancellationToken ct) =>
        categories.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.CatalogView)]
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

    /// <summary>Edita el nombre o activa/desactiva la categoría.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<ItemCategoryDto> Update(Guid id, UpdateItemCategoryRequest request, CancellationToken ct) =>
        categories.UpdateAsync(id, request, ct);
}

[ApiController]
[Route("items")]
[Tags("Catálogos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemsController(IItemService items) : ControllerBase
{
    /// <summary>Artículos. Filtros: q (SKU o nombre), type, categoryId, includeInactive.</summary>
    [HttpGet]
    [RequirePermission(Permissions.CatalogView)]
    public Task<PagedResult<ItemListItemDto>> List([FromQuery] ItemListQuery query, CancellationToken ct) =>
        items.ListAsync(query, ct);

    /// <summary>
    /// Búsqueda ligera de artículos activos (SKU o nombre) para los selectores de inventario, logística,
    /// producción y compras. No exige catalog.view: basta ver alguno de esos módulos.
    /// </summary>
    [HttpGet("lookup")]
    [RequireAnyPermission(Permissions.CatalogView, Permissions.InventoryView, Permissions.LogisticsView,
        Permissions.ProductionView, Permissions.PurchasingView)]
    public Task<IReadOnlyList<ItemLookupDto>> Lookup([FromQuery] ItemLookupQuery query, CancellationToken ct) =>
        items.LookupAsync(query, ct);

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
    public Task<ItemDto> Update(Guid id, UpdateItemRequest request, CancellationToken ct) =>
        items.UpdateAsync(id, request, ct);

    /// <summary>Mínimo y máximo (unidad base) del artículo en cada ubicación a tu alcance.</summary>
    [HttpGet("{id:guid}/location-settings")]
    [RequirePermission(Permissions.CatalogView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<ItemLocationSettingDto>> GetLocationSettings(Guid id, CancellationToken ct) =>
        items.GetLocationSettingsAsync(id, ct);

    /// <summary>Guarda mínimo y máximo por ubicación. Mínimo y máximo vacíos quitan la configuración de esa ubicación.</summary>
    [HttpPut("{id:guid}/location-settings")]
    [RequirePermission(Permissions.CatalogManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<ItemLocationSettingDto>> UpdateLocationSettings(
        Guid id, UpdateItemLocationSettingsRequest request, CancellationToken ct) =>
        items.UpdateLocationSettingsAsync(id, request, ct);
}

[ApiController]
[Route("imports")]
[Tags("Importaciones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ImportsController(IItemImportService itemImport) : ControllerBase
{
    public const long MaxFileBytes = 2 * 1024 * 1024;

    /// <summary>
    /// Importa artículos desde CSV UTF-8 (separador , o ;). Columnas: sku, nombre, tipo, categoria, unidad_base
    /// (obligatorias); unidad_compra, factor_compra, maneja_lotes, vida_util_dias, almacenamiento, iva (opcionales).
    /// Si alguna fila tiene errores responde 400 con rowErrors y no importa nada. Un SKU existente se actualiza.
    /// </summary>
    [HttpPost("items")]
    [RequirePermission(Permissions.CatalogManage)]
    [RequestSizeLimit(MaxFileBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxFileBytes + 64 * 1024)]
    [ProducesResponseType<ItemImportResult>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ItemImportResult> ImportItems(IFormFile file, CancellationToken ct)
    {
        if (file.Length > MaxFileBytes)
            throw new Domain.Common.ImportValidationException([new(1, null, "El archivo excede el máximo de 2 MB.")]);

        await using var stream = file.OpenReadStream();
        return await itemImport.ImportAsync(stream, ct);
    }
}
