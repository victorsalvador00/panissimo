namespace Sgo.Application.Common;

/// <summary>Body of state-change actions (activate, submit, cancel...): the version the client last saw.</summary>
public sealed record VersionRequest(uint Version);
