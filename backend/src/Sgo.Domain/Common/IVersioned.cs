namespace Sgo.Domain.Common;

/// <summary>
/// Optimistic concurrency token backed by the Postgres system column <c>xmin</c>.
/// Detail DTOs expose it as <c>version</c>; edits and state changes must send it back.
/// </summary>
public interface IVersioned
{
    uint Version { get; }
}
