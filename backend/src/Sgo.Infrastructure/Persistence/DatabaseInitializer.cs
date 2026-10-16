using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Sgo.Infrastructure.Persistence.Seed;

namespace Sgo.Infrastructure.Persistence;

public sealed class DatabaseOptions
{
    public const string Section = "Database";

    /// <summary>Apply pending migrations at startup. Development/tests only; production runs the migration bundle.</summary>
    public bool MigrateOnStartup { get; set; }

    /// <summary>Run the idempotent seed at startup (Development). Production uses <c>--seed</c>.</summary>
    public bool SeedOnStartup { get; set; }
}

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, bool migrate, bool seed, CancellationToken ct = default)
    {
        if (!migrate && !seed)
            return;

        await using var scope = services.CreateAsyncScope();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseInitializer));

        if (migrate)
        {
            logger.LogInformation("Applying database migrations");
            await scope.ServiceProvider.GetRequiredService<SgoDbContext>().Database.MigrateAsync(ct);
        }

        if (seed)
        {
            logger.LogInformation("Seeding base data");
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync(ct);
        }
    }
}
