using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Panissimo.Infrastructure.Persistence.Seed;

namespace Panissimo.Infrastructure.Persistence;

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
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync(ct);
        }

        if (seed)
        {
            logger.LogInformation("Seeding base data");
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync(ct);
        }
    }
}
