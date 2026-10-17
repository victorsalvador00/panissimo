using Panissimo.Domain.Security;

namespace Panissimo.UnitTests.Domain;

public class RefreshTokenTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

    private static RefreshToken NewToken() => new(Guid.NewGuid(), "hash", Guid.NewGuid(), Now, Now.AddDays(7), "127.0.0.1");

    [Fact]
    public void Rotate_revokes_the_token_and_keeps_the_family()
    {
        var token = NewToken();

        var next = token.Rotate("hash2", Now.AddMinutes(1), Now.AddDays(8), null);

        Assert.True(token.WasRotated);
        Assert.False(token.IsActive(Now.AddMinutes(1)));
        Assert.Equal(next.Id, token.ReplacedByTokenId);
        Assert.Equal(token.FamilyId, next.FamilyId);
        Assert.True(next.IsActive(Now.AddMinutes(1)));
    }

    [Fact]
    public void Grace_window_is_measured_from_the_rotation()
    {
        var token = NewToken();
        token.Rotate("hash2", Now, Now.AddDays(7), null);

        Assert.True(token.RotatedWithin(Now.AddSeconds(29), TimeSpan.FromSeconds(30)));
        Assert.False(token.RotatedWithin(Now.AddSeconds(31), TimeSpan.FromSeconds(30)));
    }

    [Fact]
    public void Expired_or_revoked_tokens_cannot_rotate()
    {
        var expired = NewToken();
        Assert.Throws<InvalidOperationException>(() => expired.Rotate("x", Now.AddDays(8), Now.AddDays(15), null));

        var revoked = NewToken();
        revoked.Revoke(Now, RefreshTokenRevocation.Logout);
        Assert.Throws<InvalidOperationException>(() => revoked.Rotate("x", Now, Now.AddDays(7), null));
    }

    [Fact]
    public void Revoke_keeps_the_first_reason()
    {
        var token = NewToken();

        token.Revoke(Now, RefreshTokenRevocation.Logout);
        token.Revoke(Now.AddMinutes(1), RefreshTokenRevocation.ReuseDetected);

        Assert.Equal(RefreshTokenRevocation.Logout, token.RevokedReason);
        Assert.Equal(Now, token.RevokedAt);
    }
}
