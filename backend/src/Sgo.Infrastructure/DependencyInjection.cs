using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Dashboard;
using Sgo.Application.Inventory;
using Sgo.Application.Logistics;
using Sgo.Application.Organization;
using Sgo.Application.Production;
using Sgo.Application.Purchasing;
using Sgo.Application.Security;
using Sgo.Infrastructure.Csv;
using Sgo.Infrastructure.Identity;
using Sgo.Infrastructure.Inventory;
using Sgo.Infrastructure.Persistence;
using Sgo.Infrastructure.Persistence.Interceptors;
using Sgo.Infrastructure.Persistence.Seed;

namespace Sgo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(_ =>
        {
            var connectionString = configuration.GetConnectionString("Default");
            // `dotnet ef migrations add` builds the model without touching the database.
            if (string.IsNullOrWhiteSpace(connectionString) && EF.IsDesignTime)
                connectionString = "Host=localhost;Database=sgo_design_time";
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException(
                    "Missing connection string 'Default'. Set SGO__ConnectionStrings__Default.");
            return NpgsqlDataSource.Create(connectionString);
        });
        services.AddSingleton<IClock, SystemClock>();

        services.AddScoped<TimestampsInterceptor>();
        services.AddScoped<AuditInterceptor>();
        services.AddDbContext<SgoDbContext>((sp, options) => options
            .UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(),
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", "public"))
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(sp.GetRequiredService<TimestampsInterceptor>(), sp.GetRequiredService<AuditInterceptor>()));
        services.AddScoped<ISgoDbContext>(sp => sp.GetRequiredService<SgoDbContext>());
        services.AddScoped<IFolioGenerator, FolioGenerator>();
        services.AddScoped<ITransactionLocks, PostgresTransactionLocks>();

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
            .AddEntityFrameworkStores<SgoDbContext>();

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
        services.AddScoped<PrivilegeGuard>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IRoleService, RoleService>();
        services.AddScoped<IAuditLogQueries, AuditLogQueries>();
        services.AddScoped<IUserDirectory, UserDirectory>();
        services.AddScoped<ILocationService, LocationService>();
        services.AddScoped<IUnitOfMeasureService, UnitOfMeasureService>();
        services.AddScoped<IItemCategoryService, ItemCategoryService>();
        services.AddScoped<IItemService, ItemService>();
        services.AddScoped<IItemImportService, ItemImportService>();
        services.AddSingleton<ICsvReader, CsvFileReader>();
        services.AddScoped<IInventoryPostingService, InventoryPostingService>();
        services.AddScoped<ILotAllocator, LotAllocator>();
        services.AddScoped<ILotRegistry, LotRegistry>();
        services.AddScoped<IAdjustmentService, AdjustmentService>();
        services.AddScoped<IInitialStockImportService, InitialStockImportService>();
        services.AddScoped<IStockQueries, StockQueries>();
        services.AddScoped<IInventorySnapshotReader, InventorySnapshotReader>();
        services.AddScoped<IPhysicalCountService, PhysicalCountService>();
        services.AddScoped<IConsumptionService, ConsumptionService>();
        services.AddScoped<ITransferService, TransferService>();
        services.AddScoped<IBranchOrderService, BranchOrderService>();
        services.AddScoped<IRecipeService, RecipeService>();
        services.AddScoped<IProductionOrderService, ProductionOrderService>();
        services.AddScoped<ISupplierService, SupplierService>();
        services.AddScoped<IRequisitionService, RequisitionService>();
        services.AddScoped<IPurchaseOrderService, PurchaseOrderService>();
        services.AddScoped<IGoodsReceiptService, GoodsReceiptService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<IDashboardService, DashboardService>();

        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.Section));
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.Section));
        services.AddScoped<DatabaseSeeder>();

        return services;
    }
}
