using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Production;

[ApiController]
[Route("recipes")]
[Tags("Recetas")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class RecipesController(IRecipeService recipes) : ControllerBase
{
    /// <summary>Recetas activas; includeInactive=true incluye versiones anteriores. Filtros: outputItemId, outputType, q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    public Task<PagedResult<RecipeListItemDto>> List([FromQuery] RecipeListQuery query, CancellationToken ct) =>
        recipes.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RecipeDto> Get(Guid id, CancellationToken ct) => recipes.GetAsync(id, ct);

    /// <summary>Crea la receta de un semiterminado o terminado. Solo puede haber una activa por artículo (RN-10).</summary>
    [HttpPost]
    [RequirePermission(Permissions.ProductionRecipesManage)]
    [ProducesResponseType<RecipeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<RecipeDto>> Create(CreateRecipeRequest request, CancellationToken ct)
    {
        var recipe = await recipes.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = recipe.Id }, recipe);
    }

    /// <summary>
    /// Edita la versión activa. Si ya se usó en una orden de producción crea la versión N+1 (RN-10): la respuesta
    /// trae el id de la nueva versión.
    /// </summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.ProductionRecipesManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RecipeDto> Update(Guid id, UpdateRecipeRequest request, CancellationToken ct) =>
        recipes.UpdateAsync(id, request, ct);

    /// <summary>Activa esta versión. Si el artículo tiene otra activa, desactívala primero (RN-10).</summary>
    [HttpPost("{id:guid}/activate")]
    [RequirePermission(Permissions.ProductionRecipesManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RecipeDto> Activate(Guid id, VersionRequest request, CancellationToken ct) =>
        recipes.ActivateAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/deactivate")]
    [RequirePermission(Permissions.ProductionRecipesManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RecipeDto> Deactivate(Guid id, VersionRequest request, CancellationToken ct) =>
        recipes.DeactivateAsync(id, request.Version, ct);

    /// <summary>Consumo teórico para producir qty (RN-11). Con locationId agrega existencia utilizable, faltante y costo estimado (RN-12).</summary>
    [HttpGet("{id:guid}/explode")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ExplosionDto> Explode(Guid id, [FromQuery] decimal qty, [FromQuery] Guid? locationId, CancellationToken ct) =>
        recipes.ExplodeAsync(id, qty, locationId, ct);

    /// <summary>
    /// Costo teórico de cada versión de la receta del producto (RN-51): Σ cantidad × (1 + % merma) × costo promedio vigente en
    /// la ubicación (con sus subalmacenes) / rendimiento. Marca los componentes cuyo último costo de compra subió al menos
    /// production.cost_increase_alert_pct en los últimos 30 días. Solo lectura.
    /// </summary>
    [HttpGet("{id:guid}/costs")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RecipeCostsDto> Costs(Guid id, [FromQuery] Guid locationId, CancellationToken ct) => recipes.CostsAsync(id, locationId, ct);
}
