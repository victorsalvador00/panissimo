using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Security;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class AuthTests(ApiFactory factory)
{
    private const string Login = "/api/v1/auth/login";
    private const string Refresh = "/api/v1/auth/refresh";

    private static async Task<string> CodeOf(HttpResponseMessage response) =>
        (await response.Content.ReadJsonAsync<ProblemDetails>())!.Extensions["code"]!.ToString()!;

    [Fact]
    public async Task Login_returns_access_token_and_sets_the_refresh_cookie()
    {
        var client = factory.CreateHttpsClient();

        var response = await client.PostJsonAsync(Login, new LoginRequest(ApiFactory.AdminEmail, ApiFactory.AdminPassword));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = await response.Content.ReadJsonAsync<TokenResponse>();
        Assert.False(string.IsNullOrEmpty(token!.AccessToken));
        Assert.Equal(15 * 60, token.ExpiresIn);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.Contains("pan_refresh=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/v1/auth", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Wrong_password_returns_401_in_spanish()
    {
        var response = await factory.CreateHttpsClient().PostJsonAsync(Login, new LoginRequest(ApiFactory.AdminEmail, "Incorrecta123"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("invalid_credentials", await CodeOf(response));
    }

    [Fact]
    public async Task Five_failed_attempts_lock_the_account()
    {
        var email = ApiFactory.UniqueEmail("bloqueo");
        await factory.CreateUserAsync(email, ["read_only"], ["PLANTA"]);
        var client = factory.CreateHttpsClient();

        for (var i = 0; i < 5; i++)
            await client.PostJsonAsync(Login, new LoginRequest(email, "Incorrecta123"));
        var response = await client.PostJsonAsync(Login, new LoginRequest(email, ApiFactory.DefaultPassword));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("account_locked", await CodeOf(response));
    }

    [Fact]
    public async Task Inactive_user_cannot_log_in()
    {
        var email = ApiFactory.UniqueEmail("inactivo");
        var userId = await factory.CreateUserAsync(email, ["read_only"], ["PLANTA"]);
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == userId);
            user.IsActive = false;
            await db.SaveChangesAsync();
        }

        var response = await factory.CreateHttpsClient().PostJsonAsync(Login, new LoginRequest(email, ApiFactory.DefaultPassword));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("user_inactive", await CodeOf(response));
    }

    [Fact]
    public async Task Login_is_rate_limited_per_ip()
    {
        using var limited = factory.WithWebHostBuilder(b => b.UseSetting("RateLimiting:LoginPermitLimit", "2"));
        var client = limited.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var request = new LoginRequest(ApiFactory.AdminEmail, "Incorrecta123");

        await client.PostJsonAsync(Login, request);
        await client.PostJsonAsync(Login, request);
        var third = await client.PostJsonAsync(Login, request);

        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.Equal("too_many_requests", await CodeOf(third));
    }

    [Fact]
    public async Task Me_returns_permissions_and_locations()
    {
        var client = await factory.LoginAsAdminAsync();

        var me = await client.GetJsonAsync<MeDto>("/api/v1/me");

        Assert.Equal(ApiFactory.AdminEmail, me!.Email);
        Assert.True(me.AllLocations);
        Assert.Contains("production.orders.close", me.Permissions);
        Assert.Contains(me.Locations, l => l.Code == "PLANTA" && l.Type == "Plant");
    }

    [Fact]
    public async Task Requests_without_token_get_401()
    {
        var response = await factory.CreateHttpsClient().GetAsync("/api/v1/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_the_cookie_and_the_old_one_is_rejected_after_the_grace_window()
    {
        var (_, original) = await LoginRawAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        var first = await RefreshWith(original);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var rotated = RefreshCookieOf(first);
        Assert.NotEqual(original, rotated);

        // Reuse of the original inside the 30 s grace window (two tabs): a sibling token, not a revocation.
        var sibling = await RefreshWith(original);
        Assert.Equal(HttpStatusCode.OK, sibling.StatusCode);

        // Push the rotation outside the grace window: reusing the original now revokes the whole family.
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlAsync(
                $"UPDATE security.refresh_token SET revoked_at = revoked_at - interval '1 minute' WHERE revoked_reason = 'Rotated'");
        }

        var reuse = await RefreshWith(original);
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
        Assert.Equal("session_expired", await CodeOf(reuse));

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshWith(rotated)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshWith(RefreshCookieOf(sibling))).StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var (access, refresh) = await LoginRawAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        var logout = await SendAsync(HttpMethod.Post, "/api/v1/auth/logout", access, refresh);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshWith(refresh)).StatusCode);
    }

    [Fact]
    public async Task Change_password_closes_the_sessions()
    {
        var email = ApiFactory.UniqueEmail("cambio");
        await factory.CreateUserAsync(email, ["read_only"], ["PLANTA"]);
        var (access, refresh) = await LoginRawAsync(email, ApiFactory.DefaultPassword);

        var wrong = await SendAsync(HttpMethod.Post, "/api/v1/me/change-password", access, null,
            new ChangePasswordRequest("NoEsLaActual1", "OtraContrasena2027"));
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        var weak = await SendAsync(HttpMethod.Post, "/api/v1/me/change-password", access, null,
            new ChangePasswordRequest(ApiFactory.DefaultPassword, "corta"));
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        var ok = await SendAsync(HttpMethod.Post, "/api/v1/me/change-password", access, null,
            new ChangePasswordRequest(ApiFactory.DefaultPassword, "OtraContrasena2027"));
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshWith(refresh)).StatusCode);
        await factory.LoginAsync(email, "OtraContrasena2027");
    }

    [Fact]
    public async Task Missing_permission_returns_403_and_any_of_the_listed_is_enough()
    {
        var email = ApiFactory.UniqueEmail("encargado");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var client = await factory.LoginAsync(email);

        var forbidden = await client.GetAsync("/api/v1/test-probe/catalog-manage");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal("forbidden", await CodeOf(forbidden));

        // purchasing.view or inventory.view: the branch manager only has the second.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/test-probe/any-of")).StatusCode);
    }

    [Fact]
    public async Task Locations_outside_the_scope_return_403()
    {
        var email = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var client = await factory.LoginAsync(email);
        Guid own, other;
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            own = await db.Locations.Where(l => l.Code == "SUC-01").Select(l => l.Id).SingleAsync();
            other = await db.Locations.Where(l => l.Code == "SUC-02").Select(l => l.Id).SingleAsync();
        }

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/test-probe/locations/{own}")).StatusCode);
        var response = await client.GetAsync($"/api/v1/test-probe/locations/{other}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(LocationScope.OutOfScopeMessage, (await response.Content.ReadJsonAsync<ProblemDetails>())!.Detail);
    }

    private HttpClient RawClient() =>
        factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });

    private async Task<(string Access, string Refresh)> LoginRawAsync(string email, string password)
    {
        var response = await RawClient().PostJsonAsync(Login, new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadJsonAsync<TokenResponse>();
        return (token!.AccessToken, RefreshCookieOf(response));
    }

    private static string RefreshCookieOf(HttpResponseMessage response)
    {
        var header = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("pan_refresh=", StringComparison.Ordinal));
        return header["pan_refresh=".Length..header.IndexOf(';')];
    }

    private Task<HttpResponseMessage> RefreshWith(string token) => SendAsync(HttpMethod.Post, Refresh, null, token);

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string? access, string? refresh, object? body = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (access is not null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        if (refresh is not null)
            request.Headers.Add("Cookie", $"pan_refresh={refresh}");
        if (body is not null)
            request.Content = JsonContent.Create(body);
        return RawClient().SendAsync(request);
    }
}
