using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Security;

namespace Panissimo.Api.Controllers.Security;

[ApiController]
[Route("auth")]
[Tags("Autenticación")]
public sealed class AuthController(IAuthService auth) : ControllerBase
{
    /// <summary>Inicia sesión. Devuelve el access token y deja el refresh token en una cookie HttpOnly.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(AuthSetup.LoginRateLimitPolicy)]
    [ProducesResponseType<TokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status429TooManyRequests)]
    public async Task<TokenResponse> Login(LoginRequest request, CancellationToken ct)
    {
        var result = await auth.LoginAsync(request, ct);
        RefreshTokenCookie.Write(Response, result.RefreshToken, result.RefreshTokenExpiresAt);
        return result.Token;
    }

    /// <summary>Rota el refresh token de la cookie y devuelve un nuevo access token.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [ProducesResponseType<TokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<TokenResponse> Refresh(CancellationToken ct)
    {
        try
        {
            var result = await auth.RefreshAsync(RefreshTokenCookie.Read(Request), ct);
            RefreshTokenCookie.Write(Response, result.RefreshToken, result.RefreshTokenExpiresAt);
            return result.Token;
        }
        catch
        {
            RefreshTokenCookie.Delete(Response);
            throw;
        }
    }

    /// <summary>Cierra la sesión: revoca el refresh token y borra la cookie.</summary>
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await auth.LogoutAsync(RefreshTokenCookie.Read(Request), ct);
        RefreshTokenCookie.Delete(Response);
        return NoContent();
    }
}

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

    /// <summary>Cambia la contraseña. Cierra todas las sesiones: hay que volver a iniciar sesión.</summary>
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
