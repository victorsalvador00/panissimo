using Microsoft.AspNetCore.Identity;

namespace Sgo.Infrastructure.Identity;

/// <summary>Identity error messages shown to users, in Spanish (Mexico).</summary>
public sealed class SpanishIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError DefaultError() => Error(nameof(DefaultError), "Ocurrió un error desconocido.");
    public override IdentityError PasswordMismatch() => Error(nameof(PasswordMismatch), "La contraseña es incorrecta.");
    public override IdentityError InvalidEmail(string? email) => Error(nameof(InvalidEmail), $"El correo '{email}' no es válido.");
    public override IdentityError InvalidUserName(string? userName) => Error(nameof(InvalidUserName), $"El nombre de usuario '{userName}' no es válido.");
    public override IdentityError DuplicateEmail(string email) => Error(nameof(DuplicateEmail), $"El correo '{email}' ya está registrado.");
    public override IdentityError DuplicateUserName(string userName) => Error(nameof(DuplicateUserName), $"El usuario '{userName}' ya existe.");
    public override IdentityError DuplicateRoleName(string role) => Error(nameof(DuplicateRoleName), $"El rol '{role}' ya existe.");
    public override IdentityError InvalidRoleName(string? role) => Error(nameof(InvalidRoleName), $"El nombre de rol '{role}' no es válido.");
    public override IdentityError UserAlreadyInRole(string role) => Error(nameof(UserAlreadyInRole), $"El usuario ya tiene el rol '{role}'.");
    public override IdentityError UserNotInRole(string role) => Error(nameof(UserNotInRole), $"El usuario no tiene el rol '{role}'.");
    public override IdentityError UserLockoutNotEnabled() => Error(nameof(UserLockoutNotEnabled), "El bloqueo no está habilitado para este usuario.");
    public override IdentityError ConcurrencyFailure() => Error(nameof(ConcurrencyFailure), "El registro fue modificado por otro usuario. Recarga e intenta de nuevo.");
    public override IdentityError InvalidToken() => Error(nameof(InvalidToken), "El token no es válido.");
    public override IdentityError PasswordTooShort(int length) => Error(nameof(PasswordTooShort), $"La contraseña debe tener al menos {length} caracteres.");
    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => Error(nameof(PasswordRequiresUniqueChars), $"La contraseña debe tener al menos {uniqueChars} caracteres distintos.");
    public override IdentityError PasswordRequiresNonAlphanumeric() => Error(nameof(PasswordRequiresNonAlphanumeric), "La contraseña debe tener al menos un símbolo.");
    public override IdentityError PasswordRequiresDigit() => Error(nameof(PasswordRequiresDigit), "La contraseña debe tener al menos un número.");
    public override IdentityError PasswordRequiresLower() => Error(nameof(PasswordRequiresLower), "La contraseña debe tener al menos una minúscula.");
    public override IdentityError PasswordRequiresUpper() => Error(nameof(PasswordRequiresUpper), "La contraseña debe tener al menos una mayúscula.");

    private static IdentityError Error(string code, string description) => new() { Code = code, Description = description };
}
