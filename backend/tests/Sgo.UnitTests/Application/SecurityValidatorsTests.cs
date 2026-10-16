using Sgo.Application.Organization;
using Sgo.Application.Security;
using Sgo.Domain.Security;

namespace Sgo.UnitTests.Application;

public class SecurityValidatorsTests
{
    private static readonly Guid Role = Guid.NewGuid();
    private static readonly Guid Loc1 = Guid.NewGuid();
    private static readonly Guid Loc2 = Guid.NewGuid();

    private static CreateUserRequest ValidUser() =>
        new("laura@ejemplo.mx", "Laura Méndez", "Temporal2024x", [Role], [Loc1, Loc2], Loc2);

    private static IEnumerable<string> ErrorsOf(FluentValidation.Results.ValidationResult result, string property) =>
        result.Errors.Where(e => e.PropertyName == property).Select(e => e.ErrorMessage);

    [Fact]
    public void Valid_user_passes() => Assert.True(new CreateUserRequestValidator().Validate(ValidUser()).IsValid);

    [Fact]
    public void User_needs_at_least_one_role()
    {
        var result = new CreateUserRequestValidator().Validate(ValidUser() with { RoleIds = [] });
        Assert.Contains("Asigna al menos un rol.", ErrorsOf(result, "RoleIds"));
    }

    [Fact]
    public void Default_location_must_be_assigned()
    {
        var result = new CreateUserRequestValidator().Validate(ValidUser() with { DefaultLocationId = Guid.NewGuid() });
        Assert.Contains("La ubicación por defecto debe estar entre las ubicaciones asignadas.", ErrorsOf(result, "DefaultLocationId"));
    }

    [Fact]
    public void Missing_lists_are_reported_without_crashing()
    {
        var result = new UpdateUserRequestValidator().Validate(new UpdateUserRequest(1, "Laura", null!, null!, Loc1));
        Assert.NotEmpty(ErrorsOf(result, "RoleIds"));
        Assert.NotEmpty(ErrorsOf(result, "LocationIds"));
    }

    [Fact]
    public void Duplicated_assignments_are_rejected()
    {
        var result = new CreateUserRequestValidator().Validate(ValidUser() with { RoleIds = [Role, Role], LocationIds = [Loc1, Loc1], DefaultLocationId = null });
        Assert.Contains("Hay roles repetidos.", ErrorsOf(result, "RoleIds"));
        Assert.Contains("Hay ubicaciones repetidas.", ErrorsOf(result, "LocationIds"));
    }

    [Fact]
    public void Role_permissions_must_exist_and_not_repeat()
    {
        var validator = new CreateRoleRequestValidator();
        Assert.True(validator.Validate(new CreateRoleRequest("Supervisor", "", [Permissions.InventoryView])).IsValid);

        var unknown = validator.Validate(new CreateRoleRequest("Supervisor", "", ["inventory.delete"]));
        Assert.Contains(unknown.Errors, e => e.ErrorMessage == "El permiso 'inventory.delete' no existe.");

        var repeated = validator.Validate(new CreateRoleRequest("Supervisor", "", [Permissions.InventoryView, Permissions.InventoryView]));
        Assert.Contains(repeated.Errors, e => e.ErrorMessage == "Hay permisos repetidos.");

        Assert.False(validator.Validate(new CreateRoleRequest("", "", [])).IsValid);
    }

    [Fact]
    public void Location_name_is_required() =>
        Assert.False(new UpdateLocationRequestValidator().Validate(new UpdateLocationRequest(1, " ", null, true)).IsValid);
}
