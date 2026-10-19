using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Identity;
using Panissimo.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Panissimo.IntegrationTests.Infrastructure;

/// <summary>
/// The API against a throwaway Postgres 16 container, shared by the tests of a collection. Starts in Development,
/// so the host applies the migrations and runs the seed (with <c>Fixtures/locations.csv</c>) on first use.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    /// <summary>
    /// Today's business date, as the server computes it (Mexico City). Never UTC: after 6 pm in Mexico UTC is
    /// already the next day, and expiry or "past date" rules would disagree with the server.
    /// </summary>
    public static DateOnly Today => BusinessCalendar.ToBusinessDate(DateTimeOffset.UtcNow);

    public const string AdminEmail = "admin@panissimo.test";
    public const string AdminPassword = "Administrador2026";
    public const string DefaultPassword = "Contrasena2026";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16").Build();

    public string ConnectionString => _postgres.GetConnectionString();

    /// <summary>The container itself (its logs carry the auto_explain plans of the volume test).</summary>
    public PostgreSqlContainer Postgres => _postgres;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        // Builds the host now: migrations and seed run before the first test.
        _ = Services;

        // RN-113: dispatches choose a vehicle and a driver of the catalog.
        await using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var vehicle = new Vehicle("PRUEBA-01", "Camioneta de prueba");
        var driver = new Driver("Chofer de prueba", null);
        db.AddRange(vehicle, driver);
        await db.SaveChangesAsync();
        (VehicleId, DriverId) = (vehicle.Id, driver.Id);
    }

    /// <summary>Active vehicle and driver for dispatches (RN-113); one test database per run.</summary>
    public static Guid VehicleId { get; private set; }

    public static Guid DriverId { get; private set; }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    /// <summary>A scope with its own <see cref="AppDbContext"/>, outside any HTTP request.</summary>
    public AsyncServiceScope CreateScope() => Services.CreateAsyncScope();

    /// <summary>
    /// Client over https (the refresh cookie is <c>Secure</c>) that keeps cookies between calls.
    /// </summary>
    public HttpClient CreateHttpsClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });

    /// <summary>Logs in and returns a client with the bearer token (and the refresh cookie).</summary>
    public async Task<HttpClient> LoginAsync(string email, string password = DefaultPassword)
    {
        var client = CreateHttpsClient();
        var response = await client.PostJsonAsync("/api/v1/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadJsonAsync<TokenResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token!.AccessToken);
        return client;
    }

    public Task<HttpClient> LoginAsAdminAsync() => LoginAsync(AdminEmail, AdminPassword);

    /// <summary>Creates an active user with the given seeded roles and locations (by code). Returns its id.</summary>
    public async Task<Guid> CreateUserAsync(string email, string[] roleKeys, string[] locationCodes, string password = DefaultPassword)
    {
        await using var scope = CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

        var locationIds = await db.Locations.Where(l => locationCodes.Contains(l.Code)).Select(l => l.Id).ToListAsync();
        var user = new AppUser(email, email.Split('@')[0]) { EmailConfirmed = true, DefaultLocationId = locationIds.FirstOrDefault() };
        var created = await users.CreateAsync(user, password);
        if (!created.Succeeded)
            throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));

        var roleNames = await db.Roles.Where(r => roleKeys.Contains(r.SystemKey!)).Select(r => r.Name!).ToListAsync();
        await users.AddToRolesAsync(user, roleNames);
        db.UserLocations.AddRange(locationIds.Select(id => new UserLocation(user.Id, id)));
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static string UniqueEmail(string prefix) => $"{prefix}.{Guid.NewGuid():N}@panissimo.test";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:Key", "integration-tests-signing-key-0123456789abcdef");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:LocationsCsv", Path.Combine(AppContext.BaseDirectory, "Fixtures", "locations.csv"));
        // Keeps the shared plant without sub-warehouses; tests of RN-44..RN-47 create their own (B-26).
        builder.UseSetting("Seed:PlantWarehouses", "false");
        // Many logins per test run; the limit itself is covered by its own test with a fresh factory.
        builder.UseSetting("RateLimiting:LoginPermitLimit", "1000");
        builder.ConfigureTestServices(services =>
            services.AddControllers().AddApplicationPart(typeof(ApiFactory).Assembly));
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
