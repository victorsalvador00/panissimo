namespace Sgo.Application.Common;

/// <summary>RN-40: locations the current user may operate on.</summary>
public interface ILocationScope
{
    IReadOnlySet<Guid> AllowedLocationIds { get; }

    /// <summary>Throws <see cref="Sgo.Domain.Common.ForbiddenException"/> if the location is out of scope.</summary>
    void EnsureAccess(Guid locationId);
}
