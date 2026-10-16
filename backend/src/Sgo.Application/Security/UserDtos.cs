using Sgo.Application.Common;

namespace Sgo.Application.Security;

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
    DateTimeOffset? UpdatedAt,
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
