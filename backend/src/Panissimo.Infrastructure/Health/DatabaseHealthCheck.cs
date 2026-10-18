using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Panissimo.Infrastructure.Health;

/// <summary>
/// /health/ready: the API can open a connection and run a trivial query, through the same data source (pool and settings)
/// the API uses.
/// </summary>
public sealed class DatabaseHealthCheck(IConfiguration configuration, IServiceProvider services) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(configuration.GetConnectionString("Default")))
            return HealthCheckResult.Unhealthy("ConnectionStrings:Default is not configured.");

        try
        {
            await using var connection = await services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync(cancellationToken);
            await using var command = new NpgsqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception ex) when (ex is NpgsqlException or InvalidOperationException or TimeoutException)
        {
            return HealthCheckResult.Unhealthy("La base de datos no responde.", ex);
        }
    }
}
