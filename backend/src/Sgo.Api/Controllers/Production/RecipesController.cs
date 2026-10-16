using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Production;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Production;

[ApiController]
[Route("recipes")]
[Tags("Producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class RecipesController(IRecipeService recipes) : ControllerBase
{
    /// <summary>Recetas activas; includeInactive=true incluye versiones anteriores. Filtros: outputItemId, q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    public Task<PagedResult<RecipeListItemDto>> List([FromQuery] RecipeListQuery query, CancellationToken ct) =>
        recipes.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RecipeDto> Get(Guid id, CancellationToken ct) => recipes.GetAsync(id, ct);

    /// <summary>Crea la receta (versión 1) de un intermedio o terminado. Solo puede haber una activa por artículo (RN-10).</summary>
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
    /// Edita la versión activa. Si ya fue usada en una orden de producción crea la versión N+1 (RN-10):
    /// la respuesta trae el id de la nueva versión. También activa o desactiva versiones.
    /// </summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.ProductionRecipesManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RecipeDto> Update(Guid id, UpdateRecipeRequest request, CancellationToken ct) =>
        recipes.UpdateAsync(id, request, ct);

    /// <summary>Consumo teórico para producir qty (RN-11). Con locationId agrega disponibilidad (sin lotes vencidos) y costo estimado.</summary>
    [HttpGet("{id:guid}/explode")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ExplosionDto> Explode(Guid id, [FromQuery] decimal qty, [FromQuery] Guid? locationId, CancellationToken ct) =>
        recipes.ExplodeAsync(id, qty, locationId, ct);
}
