namespace Sgo.Application.Common;

/// <summary>
/// Full names of users for document DTOs (who created, approved, dispatched…). Users live in the Identity store,
/// so services look them up in one query per document or page instead of joining.
/// </summary>
public interface IUserDirectory
{
    Task<UserNames> GetNamesAsync(IEnumerable<Guid?> userIds, CancellationToken ct);
}

public sealed class UserNames(IReadOnlyDictionary<Guid, string> names)
{
    /// <summary>The name, or null for a null id or a user that no longer exists.</summary>
    public string? Of(Guid? userId) => userId is { } id && names.TryGetValue(id, out var name) ? name : null;
}
