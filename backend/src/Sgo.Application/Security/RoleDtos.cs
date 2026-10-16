using Sgo.Application.Common;

namespace Sgo.Application.Security;

public sealed record RoleListItemDto(Guid Id, string Name, string Description, bool IsSystem, int PermissionCount, int UserCount);

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
    System.Text.Json.JsonElement Changes,
    string? IpAddress);

public interface IAuditLogQueries
{
    Task<PagedResult<AuditLogDto>> ListAsync(AuditLogQuery query, CancellationToken ct = default);
}
