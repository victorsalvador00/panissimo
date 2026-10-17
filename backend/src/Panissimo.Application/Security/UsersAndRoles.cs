using System.Linq.Expressions;
using System.Text.Json;
using FluentValidation;
using Panissimo.Application.Common;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Security;

public sealed record UserListQuery : PageQuery
{
    public bool? IsActive { get; init; }
    public Guid? RoleId { get; init; }
    public Guid? LocationId { get; init; }
}

public sealed record UserListItemDto(
    Guid Id,
    string Email,
    string FullName,
    bool IsActive,
    bool IsLockedOut,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> LocationCodes);

public sealed record UserDto(
    Guid Id,
    string Email,
    string FullName,
    bool IsActive,
    bool IsLockedOut,
    Guid? DefaultLocationId,
    IReadOnlyList<Guid> RoleIds,
    IReadOnlyList<Guid> LocationIds,
    DateTimeOffset CreatedAt,
    string? CreatedByName,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    uint Version);

public sealed record CreateUserRequest(
    string Email,
    string FullName,
    string Password,
    IReadOnlyList<Guid> RoleIds,
    IReadOnlyList<Guid> LocationIds,
    Guid? DefaultLocationId);

public sealed record UpdateUserRequest(
    uint Version,
    string FullName,
    IReadOnlyList<Guid> RoleIds,
    IReadOnlyList<Guid> LocationIds,
    Guid? DefaultLocationId);

public sealed record ResetPasswordRequest(string NewPassword);

public interface IUserService
{
    Task<PagedResult<UserListItemDto>> ListAsync(UserListQuery query, CancellationToken ct = default);
    Task<UserDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<UserDto> CreateAsync(CreateUserRequest request, CancellationToken ct = default);
    Task<UserDto> UpdateAsync(Guid id, UpdateUserRequest request, CancellationToken ct = default);

    /// <summary>Sets a temporary password, unlocks the account and closes every session of the user.</summary>
    Task ResetPasswordAsync(Guid id, ResetPasswordRequest request, CancellationToken ct = default);

    Task<UserDto> ActivateAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>Also closes every session of the user.</summary>
    Task<UserDto> DeactivateAsync(Guid id, uint version, CancellationToken ct = default);
}

public sealed record RoleListItemDto(Guid Id, string Name, string Description, bool IsSystem, bool IsAdministrator,
    int PermissionCount, int UserCount);

public sealed record RoleDto(
    Guid Id,
    string Name,
    string Description,
    bool IsSystem,
    bool IsAdministrator,
    IReadOnlyList<string> Permissions,
    uint Version);

public sealed record CreateRoleRequest(string Name, string Description, IReadOnlyList<string> Permissions);

public sealed record UpdateRoleRequest(uint Version, string Name, string Description, IReadOnlyList<string> Permissions);

public sealed record PermissionDto(string Code, string Description);

public sealed record PermissionGroupDto(string Module, IReadOnlyList<PermissionDto> Permissions);

public interface IRoleService
{
    Task<PagedResult<RoleListItemDto>> ListAsync(PageQuery query, CancellationToken ct = default);
    Task<RoleDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<RoleDto> CreateAsync(CreateRoleRequest request, CancellationToken ct = default);
    Task<RoleDto> UpdateAsync(Guid id, UpdateRoleRequest request, CancellationToken ct = default);
}

public sealed record AuditLogQuery : PageQuery
{
    public string? EntityType { get; init; }

    /// <summary>
    /// History of one record: its own rows plus those whose composite key starts with it
    /// (a user's roles and locations, a role's permissions).
    /// </summary>
    public string? EntityId { get; init; }

    public Guid? UserId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record AuditLogDto(
    Guid Id,
    DateTimeOffset OccurredAt,
    Guid? UserId,
    string? UserName,
    string Action,
    string EntityType,
    string EntityId,
    JsonElement Changes,
    string? IpAddress);

public interface IAuditLogQueries
{
    Task<PagedResult<AuditLogDto>> ListAsync(AuditLogQuery query, CancellationToken ct = default);
}

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
        Expression<Func<T, IReadOnlyList<Guid>>> roleIds,
        Expression<Func<T, IReadOnlyList<Guid>>> locationIds,
        Expression<Func<T, Guid?>> defaultLocationId)
    {
        var getLocations = locationIds.Compile();

        validator.RuleFor(roleIds).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Asigna al menos un rol.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay roles repetidos.");
        validator.RuleFor(locationIds).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Asigna al menos una ubicación.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay ubicaciones repetidas.");
        validator.RuleFor(defaultLocationId)
            .Must((request, id) => id is null || getLocations(request)?.Contains(id.Value) == true)
            .WithMessage("La ubicación por defecto debe estar entre las ubicaciones asignadas.");
    }

    public static void AddRoleRules<T>(
        this AbstractValidator<T> validator,
        Expression<Func<T, string>> name,
        Expression<Func<T, string>> description,
        Expression<Func<T, IEnumerable<string>>> permissions)
    {
        validator.RuleFor(name).NotEmpty().MaximumLength(100).WithName("Nombre");
        validator.RuleFor(description).NotNull().MaximumLength(500).WithName("Descripción");
        validator.RuleFor(permissions).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Selecciona al menos un permiso.")
            .Must(codes => codes.Distinct().Count() == codes.Count()).WithMessage("Hay permisos repetidos.");
        validator.RuleForEach(permissions).Must(Permissions.IsValid).WithMessage("El permiso '{PropertyValue}' no existe.");
    }
}
