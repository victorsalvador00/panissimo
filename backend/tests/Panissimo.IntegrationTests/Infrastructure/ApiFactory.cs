using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Panissimo.IntegrationTests.Infrastructure;

/// <summary>
/// The API against a throwaway Postgres 16 container, shared by the tests of a collection. Starts in Development,
/// so the host applies the migrations and runs the seed (with <c>Fixtures/locations.csv</c>) on first use.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminEmail = "admin@panissimo.test";
    public const string AdminPassword = "Administrador2026";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16").Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        // Builds the host now: migrations and seed run before the first test.
        _ = Services;
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    /// <summary>A scope with its own <see cref="AppDbContext"/>, outside any HTTP request.</summary>
    public AsyncServiceScope CreateScope() => Services.CreateAsyncScope();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:LocationsCsv", Path.Combine(AppContext.BaseDirectory, "Fixtures", "locations.csv"));
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
