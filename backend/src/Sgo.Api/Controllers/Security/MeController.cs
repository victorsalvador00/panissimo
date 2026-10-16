using Microsoft.AspNetCore.Mvc;
using Sgo.Application.Common;
using Sgo.Application.Security;

namespace Sgo.Api.Controllers.Security;

[ApiController]
[Route("me")]
[Tags("Usuario actual")]
public sealed class MeController(IAuthService auth, ICurrentUser currentUser) : ControllerBase
{
    private Guid UserId => currentUser.UserId ?? throw new InvalidOperationException("Authenticated request without user id.");

    /// <summary>Usuario actual, permisos efectivos y ubicaciones permitidas.</summary>
    [HttpGet]
    [ProducesResponseType<MeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public Task<MeDto> Get(CancellationToken ct) => auth.GetMeAsync(UserId, ct);

    /// <summary>Cambia la contraseña. Por seguridad cierra todas las sesiones: hay que volver a iniciar sesión.</summary>
    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(UserId, request, ct);
        return NoContent();
    }
}
