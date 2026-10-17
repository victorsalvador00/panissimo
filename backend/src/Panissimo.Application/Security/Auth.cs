using FluentValidation;

namespace Panissimo.Application.Security;

public sealed record LoginRequest(string Email, string Password);

/// <param name="ExpiresIn">Access token lifetime in seconds.</param>
public sealed record TokenResponse(string AccessToken, int ExpiresIn);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record MeLocationDto(Guid Id, string Code, string Name, string Type, bool IsActive);

public sealed record MeDto(
    Guid Id,
    string Email,
    string FullName,
    Guid? DefaultLocationId,
    IReadOnlyList<string> Permissions,
    bool AllLocations,
    IReadOnlyList<MeLocationDto> Locations);

/// <summary>Result of login/refresh: the access token for the body and the refresh token for the cookie.</summary>
public sealed record AuthResult(TokenResponse Token, string RefreshToken, DateTimeOffset RefreshTokenExpiresAt);

public interface IAuthService
{
    Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken ct = default);

    /// <summary>Rotates the refresh token. Reusing a rotated token revokes its whole family (outside the grace window).</summary>
    Task<AuthResult> RefreshAsync(string? refreshToken, CancellationToken ct = default);

    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);

    Task<MeDto> GetMeAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Also revokes every refresh token of the user.</summary>
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct = default);
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256).WithName("Correo");
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128).WithName("Contraseña");
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithName("Contraseña actual");
        RuleFor(x => x.NewPassword).NotEmpty().MaximumLength(128).WithName("Contraseña nueva")
            .NotEqual(x => x.CurrentPassword).WithMessage("La contraseña nueva debe ser distinta de la actual.");
    }
}
