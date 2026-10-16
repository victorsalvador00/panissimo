using Sgo.Domain.Security;

namespace Sgo.UnitTests.Domain;

public class RefreshTokenTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);

    private static RefreshToken NewToken() =>
        new(Guid.NewGuid(), "hash-1", Guid.NewGuid(), Now, Now.AddDays(7), "10.0.0.1");

    [Fact]
    public void New_token_is_active_until_it_expires()
    {
        var token = NewToken();
        Assert.True(token.IsActive(Now));
        Assert.True(token.IsActive(Now.AddDays(7).AddTicks(-1)));
        Assert.False(token.IsActive(Now.AddDays(7)));
    }

    [Fact]
    public void Rotate_keeps_family_and_revokes_the_old_token()
    {
        var token = NewToken();

        var next = token.Rotate("hash-2", Now.AddHours(1), Now.AddDays(8), "10.0.0.2");

        Assert.Equal(token.FamilyId, next.FamilyId);
        Assert.Equal(token.UserId, next.UserId);
        Assert.True(next.IsActive(Now.AddHours(1)));
        Assert.False(token.IsActive(Now.AddHours(1)));
        Assert.True(token.WasRotated);
        Assert.Equal(next.Id, token.ReplacedByTokenId);
    }

    [Fact]
    public void Revoked_or_expired_token_cannot_be_rotated()
    {
        var revoked = NewToken();
        revoked.Revoke(Now, RefreshTokenRevocation.Logout);

        Assert.Throws<InvalidOperationException>(() => revoked.Rotate("h", Now, Now.AddDays(7), null));
        Assert.Throws<InvalidOperationException>(() => NewToken().Rotate("h", Now.AddDays(8), Now.AddDays(15), null));
    }

    [Fact]
    public void Revoke_keeps_the_first_reason()
    {
        var token = NewToken();
        token.Revoke(Now, RefreshTokenRevocation.Rotated);
        token.Revoke(Now.AddMinutes(1), RefreshTokenRevocation.ReuseDetected);

        Assert.Equal(RefreshTokenRevocation.Rotated, token.RevokedReason);
        Assert.Equal(Now, token.RevokedAt);
    }

    [Fact]
    public void Rotated_within_the_grace_period_only_right_after_the_rotation()
    {
        var token = NewToken();
        token.Rotate("hash-2", Now, Now.AddDays(7), null);
        var grace = TimeSpan.FromSeconds(30);

        Assert.True(token.RotatedWithin(Now.AddSeconds(29), grace));
        Assert.True(token.RotatedWithin(Now.AddSeconds(30), grace));
        Assert.False(token.RotatedWithin(Now.AddSeconds(31), grace));
    }

    [Fact]
    public void Token_revoked_for_another_reason_is_never_within_the_grace_period()
    {
        var token = NewToken();
        token.Revoke(Now, RefreshTokenRevocation.Logout);

        Assert.False(token.RotatedWithin(Now, TimeSpan.FromSeconds(30)));
    }
}
