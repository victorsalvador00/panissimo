using FluentValidation;
using Sgo.Domain.Security;

namespace Sgo.Application.Security;

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256).WithName("Correo");
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200).WithName("Nombre");
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128).WithName("Contraseña");
        this.AddAssignmentRules(x => x.RoleIds, x => x.LocationIds, x => x.DefaultLocationId);
    }
}

public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200).WithName("Nombre");
        this.AddAssignmentRules(x => x.RoleIds, x => x.LocationIds, x => x.DefaultLocationId);
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator() =>
        RuleFor(x => x.NewPassword).NotEmpty().MaximumLength(128).WithName("Contraseña nueva");
}

public sealed class CreateRoleRequestValidator : AbstractValidator<CreateRoleRequest>
{
    public CreateRoleRequestValidator() =>
        this.AddRoleRules(x => x.Name, x => x.Description, x => x.Permissions);
}

public sealed class UpdateRoleRequestValidator : AbstractValidator<UpdateRoleRequest>
{
    public UpdateRoleRequestValidator() =>
        this.AddRoleRules(x => x.Name, x => x.Description, x => x.Permissions);
}

internal static class SecurityValidationRules
{
    public static void AddAssignmentRules<T>(
        this AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, IReadOnlyList<Guid>>> roleIds,
        System.Linq.Expressions.Expression<Func<T, IReadOnlyList<Guid>>> locationIds,
        System.Linq.Expressions.Expression<Func<T, Guid?>> defaultLocationId)
    {
        var getLocations = locationIds.Compile();

        validator.RuleFor(roleIds).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Asigna al menos un rol.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay roles repetidos.");
        validator.RuleFor(locationIds).Cascade(CascadeMode.Stop).NotNull().WithMessage("Indica las ubicaciones asignadas.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay ubicaciones repetidas.");
        validator.RuleFor(defaultLocationId)
            .Must((request, id) => id is null || getLocations(request)?.Contains(id.Value) == true)
            .WithMessage("La ubicación por defecto debe estar entre las ubicaciones asignadas.");
    }

    public static void AddRoleRules<T>(
        this AbstractValidator<T> validator,
        System.Linq.Expressions.Expression<Func<T, string>> name,
        System.Linq.Expressions.Expression<Func<T, string>> description,
        System.Linq.Expressions.Expression<Func<T, IEnumerable<string>>> permissions)
    {
        validator.RuleFor(name).NotEmpty().MaximumLength(100).WithName("Nombre");
        validator.RuleFor(description).NotNull().MaximumLength(500).WithName("Descripción");
        validator.RuleFor(permissions).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Selecciona al menos un permiso.")
            .Must(codes => codes.Distinct().Count() == codes.Count()).WithMessage("Hay permisos repetidos.");
        validator.RuleForEach(permissions).Must(Permissions.IsValid).WithMessage("El permiso '{PropertyValue}' no existe.");
    }
}
