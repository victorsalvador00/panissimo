using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Infrastructure.Identity;
using Panissimo.Infrastructure.Persistence;
using Panissimo.Infrastructure.Persistence.Interceptors;
using Panissimo.Infrastructure.Persistence.Seed;

namespace Panissimo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(_ =>
        {
            var connectionString = configuration.GetConnectionString("Default");
            // `dotnet ef migrations add` builds the model without touching the database.
            if (string.IsNullOrWhiteSpace(connectionString) && EF.IsDesignTime)
                connectionString = "Host=localhost;Database=panissimo_design_time";
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException(
                    "Missing connection string 'Default'. Set PAN__ConnectionStrings__Default.");
            return NpgsqlDataSource.Create(connectionString);
        });
        services.AddSingleton<IClock, SystemClock>();

        services.AddScoped<TimestampsInterceptor>();
        services.AddScoped<AuditInterceptor>();
        services.AddDbContext<AppDbContext>((sp, options) => options
            .UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(),
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "public"))
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(sp.GetRequiredService<TimestampsInterceptor>(), sp.GetRequiredService<AuditInterceptor>()));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<IFolioGenerator, FolioGenerator>();
        services.AddScoped<ITransactionLocks, PostgresTransactionLocks>();
        services.AddScoped<IUserDirectory, UserDirectory>();

        services.AddIdentityCore<AppUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.Password.RequiredLength = 10;
                options.Password.RequireUppercase = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireDigit = true;
                options.Password.RequireNonAlphanumeric = false;
                // RN-42
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddRoles<AppRole>()
            .AddErrorDescriber<SpanishIdentityErrorDescriber>()
            .AddEntityFrameworkStores<AppDbContext>();

        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.Section))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddMemoryCache();
        services.AddSingleton<UserAccessCacheSignal>();
        services.AddScoped<IUserAccessService, UserAccessService>();
        services.AddScoped<UserAccessContext>();
        services.AddScoped<ILocationScope, LocationScope>();
        services.AddScoped<TokenService>();
        services.AddScoped<IAuthService, AuthService>();

        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.Section));
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.Section));
        services.AddScoped<DatabaseSeeder>();

        return services;
    }
}
