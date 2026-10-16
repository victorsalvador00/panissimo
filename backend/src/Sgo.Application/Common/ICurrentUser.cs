namespace Sgo.Application.Common;

public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
}
