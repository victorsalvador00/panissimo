using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Api.Auth;
using Sgo.Application.Security;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Identity;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class AuthTests(SgoApiFactory factory)
{
    private const string Login = "/api/v1/auth/login";
    private const string Refresh = "/api/v1/auth/refresh";
    private const string Logout = "/api/v1/auth/logout";
    private const string Me = "/api/v1/me";

    private const string BranchManager = "Encargado de sucursal";

    [Fact]
    public async Task Login_returns_access_token_and_secure_httponly_refresh_cookie()
    {
        var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = await response.Content.ReadFromJsonAsync<TokenResponse>();
        Assert.False(string.IsNullOrWhiteSpace(token!.AccessToken));
        Assert.Equal(15 * 60, token.ExpiresIn);

        var cookie = response.RefreshCookieHeader()!.ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api/v1/auth", cookie);
    }

    [Fact]
    public async Task Wrong_password_returns_401_with_generic_message()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var client = factory.CreateApiClient();

        var response = await client.PostAsJsonAsync(Login, new LoginRequest(user.Email, "Incorrecta123"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await response.ProblemAsync();
        Assert.Equal("invalid_credentials", problem.GetProperty("code").GetString());
        Assert.Equal("Correo o contraseña incorrectos.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Unknown_email_returns_same_401_as_wrong_password()
    {
        var response = await factory.CreateApiClient().PostAsJsonAsync(Login, new LoginRequest("nadie@sgo.test", "Incorrecta123"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Inactive_user_cannot_log_in()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        await SetActiveAsync(user.Id, false);

        var response = await factory.CreateApiClient().PostAsJsonAsync(Login, new LoginRequest(user.Email, user.Password));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("user_inactive", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Account_locks_after_five_failed_attempts()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var client = factory.CreateApiClient();

        for (var i = 1; i <= 4; i++)
            Assert.Equal("invalid_credentials",
                await (await client.PostAsJsonAsync(Login, new LoginRequest(user.Email, "Incorrecta123"))).ProblemCodeAsync());

        var fifth = await client.PostAsJsonAsync(Login, new LoginRequest(user.Email, "Incorrecta123"));
        Assert.Equal("account_locked", await fifth.ProblemCodeAsync());

        var correct = await client.PostAsJsonAsync(Login, new LoginRequest(user.Email, user.Password));
        Assert.Equal(HttpStatusCode.Unauthorized, correct.StatusCode);
        Assert.Equal("account_locked", await correct.ProblemCodeAsync());
    }

    [Fact]
    public async Task Invalid_login_request_returns_400_with_errors_in_spanish()
    {
        var response = await factory.CreateApiClient().PostAsJsonAsync(Login, new LoginRequest("", ""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ProblemAsync();
        Assert.Equal("validation", problem.GetProperty("code").GetString());
        var emailErrors = problem.GetProperty("errors").GetProperty("email");
        Assert.Contains("Correo", emailErrors[0].GetString());
    }

    [Fact]
    public async Task Login_is_rate_limited_to_10_requests_per_minute_per_ip()
    {
        var client = factory.CreateApiClient();
        var request = new LoginRequest("nadie@sgo.test", "Incorrecta123");

        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(Login, request)).StatusCode);

        var eleventh = await client.PostAsJsonAsync(Login, request);
        Assert.Equal(HttpStatusCode.TooManyRequests, eleventh.StatusCode);
        Assert.Equal("too_many_requests", await eleventh.ProblemCodeAsync());

        var otherIp = await factory.CreateApiClient().PostAsJsonAsync(Login, request);
        Assert.Equal(HttpStatusCode.Unauthorized, otherIp.StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_the_token_and_reuse_after_the_grace_period_revokes_the_whole_family()
    {
        var client = factory.CreateApiClient();
        var login = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));
        var first = login.RefreshCookieValue();

        var refreshed = await client.PostWithRefreshCookieAsync(Refresh, first);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await refreshed.Content.ReadFromJsonAsync<TokenResponse>())!.AccessToken));
        var second = refreshed.RefreshCookieValue();
        Assert.NotNull(second);
        Assert.NotEqual(first, second);

        await RotatedAgoAsync(first!, AuthService.ReuseGracePeriod + TimeSpan.FromSeconds(1));

        // The rotated token is presented again long after the rotation: treated as stolen.
        var reused = await client.PostWithRefreshCookieAsync(Refresh, first);
        Assert.Equal(HttpStatusCode.Unauthorized, reused.StatusCode);
        Assert.Equal("session_expired", await reused.ProblemCodeAsync());

        // ...so the legitimate successor is revoked as well.
        var afterReuse = await client.PostWithRefreshCookieAsync(Refresh, second);
        Assert.Equal(HttpStatusCode.Unauthorized, afterReuse.StatusCode);
    }

    [Fact]
    public async Task Reuse_within_the_grace_period_keeps_the_session_alive()
    {
        var client = factory.CreateApiClient();
        var login = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));
        var first = login.RefreshCookieValue();
        var second = (await client.PostWithRefreshCookieAsync(Refresh, first)).RefreshCookieValue();

        // Two tabs / a double reload sent the old cookie again right after the rotation.
        var again = await client.PostWithRefreshCookieAsync(Refresh, first);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var sibling = again.RefreshCookieValue();
        Assert.NotNull(sibling);
        Assert.NotEqual(second, sibling);

        // Neither the successor nor the new sibling was revoked.
        Assert.Equal(HttpStatusCode.OK, (await client.PostWithRefreshCookieAsync(Refresh, second)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostWithRefreshCookieAsync(Refresh, sibling)).StatusCode);
    }

    [Fact]
    public async Task Concurrent_refreshes_with_the_same_cookie_both_succeed()
    {
        var client = factory.CreateApiClient();
        var login = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));
        var cookie = login.RefreshCookieValue();

        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => client.PostWithRefreshCookieAsync(Refresh, cookie)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
    }

    [Fact]
    public async Task Reuse_within_the_grace_period_after_logout_is_rejected()
    {
        var client = factory.CreateApiClient();
        var login = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));
        var first = login.RefreshCookieValue();
        var refreshed = await client.PostWithRefreshCookieAsync(Refresh, first);
        var accessToken = (await refreshed.Content.ReadFromJsonAsync<TokenResponse>())!.AccessToken;

        using var logout = new HttpRequestMessage(HttpMethod.Post, Logout);
        logout.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        logout.Headers.Add("Cookie", $"{RefreshTokenCookie.Name}={refreshed.RefreshCookieValue()}");
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(logout)).StatusCode);

        // The session was closed on purpose: the grace period does not bring it back.
        var reused = await client.PostWithRefreshCookieAsync(Refresh, first);
        Assert.Equal(HttpStatusCode.Unauthorized, reused.StatusCode);
    }

    /// <summary>Moves the rotation of <paramref name="refreshToken"/> into the past (no controllable clock here).</summary>
    private async Task RotatedAgoAsync(string refreshToken, TimeSpan ago)
    {
        await using var scope = factory.CreateScope();
        var hash = TokenService.Hash(refreshToken);
        await SgoApiFactory.Db(scope).RefreshTokens
            .Where(t => t.TokenHash == hash)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.RevokedAt, t => t.RevokedAt - ago));
    }

    [Fact]
    public async Task Refresh_without_cookie_returns_401()
    {
        var response = await factory.CreateApiClient().PostWithRefreshCookieAsync(Refresh, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("session_expired", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token_and_clears_the_cookie()
    {
        var client = factory.CreateApiClient();
        var login = await client.PostAsJsonAsync(Login, new LoginRequest(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword));
        var refreshToken = login.RefreshCookieValue();
        var accessToken = (await login.Content.ReadFromJsonAsync<TokenResponse>())!.AccessToken;

        var request = new HttpRequestMessage(HttpMethod.Post, Logout);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Add("Cookie", $"{RefreshTokenCookie.Name}={refreshToken}");
        var logout = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains("expires=thu, 01 jan 1970", logout.RefreshCookieHeader()!.ToLowerInvariant());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostWithRefreshCookieAsync(Refresh, refreshToken)).StatusCode);
    }

    [Fact]
    public async Task Logout_requires_authentication()
    {
        var response = await factory.CreateApiClient().PostAsync(Logout, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_without_token_returns_401_problem_details()
    {
        var response = await factory.CreateApiClient().GetAsync(Me);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("unauthorized", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Me_with_invalid_token_returns_401()
    {
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Me)).StatusCode);
    }

    [Fact]
    public async Task Me_returns_effective_permissions_and_assigned_locations()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01", "SUC-03");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var me = await client.GetFromJsonAsync<MeDto>(Me);

        Assert.Equal(user.Id, me!.Id);
        Assert.False(me.AllLocations);
        Assert.Equal(["SUC-01", "SUC-03"], me.Locations.Select(l => l.Code));
        Assert.Equal(SystemRoles.All.Single(r => r.Name == BranchManager).Permissions.Order(), me.Permissions);
    }

    [Fact]
    public async Task Admin_sees_every_location()
    {
        var client = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

        var me = await client.GetFromJsonAsync<MeDto>(Me);

        Assert.True(me!.AllLocations);
        Assert.Contains(me.Locations, l => l.Code == "FAB");
        Assert.Contains(me.Locations, l => l.Code == "SUC-10");
        Assert.Contains(Permissions.SettingsManage, me.Permissions);
    }

    [Fact]
    public async Task Token_of_a_deactivated_user_is_rejected()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Me)).StatusCode);

        await SetActiveAsync(user.Id, false);

        var response = await client.GetAsync(Me);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("user_inactive", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Change_password_updates_credentials_and_closes_every_session()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var anonymous = factory.CreateApiClient();
        var login = await anonymous.PostAsJsonAsync(Login, new LoginRequest(user.Email, user.Password));
        var refreshToken = login.RefreshCookieValue();
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var change = await client.PostAsJsonAsync($"{Me}/change-password", new ChangePasswordRequest(user.Password, "OtraClave2024x"));

        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostWithRefreshCookieAsync(Refresh, refreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateApiClient().PostAsJsonAsync(Login, new LoginRequest(user.Email, user.Password))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await factory.CreateApiClient().PostAsJsonAsync(Login, new LoginRequest(user.Email, "OtraClave2024x"))).StatusCode);
    }

    [Fact]
    public async Task Change_password_reports_wrong_current_password_and_policy_errors_in_spanish()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var wrongCurrent = await client.PostAsJsonAsync($"{Me}/change-password", new ChangePasswordRequest("Incorrecta123", "OtraClave2024x"));
        Assert.Equal(HttpStatusCode.BadRequest, wrongCurrent.StatusCode);
        Assert.Equal("La contraseña actual es incorrecta.",
            (await wrongCurrent.ProblemAsync()).GetProperty("errors").GetProperty("currentPassword")[0].GetString());

        var weak = await client.PostAsJsonAsync($"{Me}/change-password", new ChangePasswordRequest(user.Password, "corta"));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        var messages = (await weak.ProblemAsync()).GetProperty("errors").GetProperty("newPassword")
            .EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Contains("La contraseña debe tener al menos 10 caracteres.", messages);
        Assert.Contains("La contraseña debe tener al menos una mayúscula.", messages);
    }

    private async Task SetActiveAsync(Guid userId, bool active)
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        var user = await db.Users.SingleAsync(u => u.Id == userId);
        user.IsActive = active;
        await db.SaveChangesAsync();
        SgoApiFactory.UserAccess(scope).Invalidate(userId);
    }
}
