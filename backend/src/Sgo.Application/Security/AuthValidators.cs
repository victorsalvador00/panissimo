using FluentValidation;

namespace Sgo.Application.Security;

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
