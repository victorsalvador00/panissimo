using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sgo.Application.Security;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Identity;
using Sgo.Infrastructure.Persistence;
using Sgo.IntegrationTests.Support;
using Testcontainers.PostgreSql;

namespace Sgo.IntegrationTests;

/// <summary>Hosts the API against a throwaway Postgres container, migrated and seeded on startup.</summary>
public sealed class SgoApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminEmail = "admin@sgo.test";
    public const string AdminPassword = "Admin12345Test";
    public const string TestPassword = "Prueba12345";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
    private int _ipCounter;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", _postgres.GetConnectionString());
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Database:SeedOnStartup", "true");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Jwt:Key", "integration-tests-signing-key-0123456789abcdef");
        builder.UseSetting("Jwt:Issuer", "sgo-tests");
        builder.UseSetting("Jwt:Audience", "sgo-tests");
        builder.ConfigureTestServices(services =>
            services.AddControllers().AddApplicationPart(typeof(ProbeController).Assembly));
    }

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        _ = Server; // start the host: applies migrations and seed
    }

    /// <summary>
    /// HTTPS client (the refresh cookie is Secure) with its own client IP, so the per-IP login
    /// rate limit of one test does not affect the others. Cookies are handled manually.
    /// </summary>
    public HttpClient CreateApiClient(string? ip = null)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = false,
        });
        client.DefaultRequestHeaders.Add("X-Forwarded-For", ip ?? NextIp());
        return client;
    }

    public string NextIp()
    {
        var n = Interlocked.Increment(ref _ipCounter);
        return $"10.0.{n / 250}.{n % 250 + 1}";
    }

    /// <summary>Logs in and returns a client that sends the access token.</summary>
    public async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = CreateApiClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<TokenResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token!.AccessToken);
        return client;
    }

    /// <summary>Creates an active user with one seeded role and the given locations.</summary>
    public async Task<TestUser> CreateUserAsync(string roleName, params string[] locationCodes)
    {
        await using var scope = CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var db = Db(scope);

        var email = $"user-{Guid.NewGuid():N}@sgo.test";
        var user = new AppUser(email, "Usuario de prueba");
        Check(await userManager.CreateAsync(user, TestPassword));
        Check(await userManager.AddToRoleAsync(user, roleName));

        var locations = await db.Locations.Where(l => locationCodes.Contains(l.Code)).ToListAsync();
        db.UserLocations.AddRange(locations.Select(l => new UserLocation(user.Id, l.Id)));
        await db.SaveChangesAsync();

        return new TestUser(user.Id, email, TestPassword);
    }

    public async Task<Guid> LocationIdAsync(string code)
    {
        await using var scope = CreateScope();
        return await Db(scope).Locations.Where(l => l.Code == code).Select(l => l.Id).SingleAsync();
    }

    /// <summary>A fresh DI scope with its own DbContext.</summary>
    public AsyncServiceScope CreateScope() => Services.CreateAsyncScope();

    public static SgoDbContext Db(AsyncServiceScope scope) => scope.ServiceProvider.GetRequiredService<SgoDbContext>();

    public static IUserAccessService UserAccess(AsyncServiceScope scope) =>
        scope.ServiceProvider.GetRequiredService<IUserAccessService>();

    private static void Check(IdentityResult result)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

public sealed record TestUser(Guid Id, string Email, string Password);

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<SgoApiFactory>
{
    public const string Name = "api";
}
