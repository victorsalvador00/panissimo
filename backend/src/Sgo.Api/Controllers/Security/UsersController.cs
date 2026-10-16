using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Security;

[ApiController]
[Route("users")]
[Tags("Usuarios")]
[RequirePermission(Permissions.SecurityUsersManage)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class UsersController(IUserService users) : ControllerBase
{
    /// <summary>Lista paginada de usuarios. Filtros: q (nombre o correo), isActive, roleId, locationId.</summary>
    [HttpGet]
    public Task<PagedResult<UserListItemDto>> List([FromQuery] UserListQuery query, CancellationToken ct) =>
        users.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<UserDto> Get(Guid id, CancellationToken ct) => users.GetAsync(id, ct);

    /// <summary>Crea un usuario con sus roles y ubicaciones. Solo puedes asignar roles y ubicaciones que tú tienes.</summary>
    [HttpPost]
    [ProducesResponseType<UserDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest request, CancellationToken ct)
    {
        var user = await users.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = user.Id }, user);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<UserDto> Update(Guid id, UpdateUserRequest request, CancellationToken ct) =>
        users.UpdateAsync(id, request, ct);

    /// <summary>Asigna una contraseña temporal, desbloquea la cuenta y cierra todas sus sesiones.</summary>
    [HttpPost("{id:guid}/reset-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ResetPassword(Guid id, ResetPasswordRequest request, CancellationToken ct)
    {
        await users.ResetPasswordAsync(id, request, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/activate")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<UserDto> Activate(Guid id, VersionRequest request, CancellationToken ct) =>
        users.ActivateAsync(id, request.Version, ct);

    /// <summary>Desactiva el usuario y cierra todas sus sesiones. No puedes desactivarte a ti mismo.</summary>
    [HttpPost("{id:guid}/deactivate")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<UserDto> Deactivate(Guid id, VersionRequest request, CancellationToken ct) =>
        users.DeactivateAsync(id, request.Version, ct);
}
