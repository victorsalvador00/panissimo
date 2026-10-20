using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Dashboard;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.Infrastructure.Inventory.Traceability;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Application.Sales;
using Panissimo.Application.Security;
using Panissimo.Infrastructure.Csv;
using Panissimo.Infrastructure.Excel;
using Panissimo.Infrastructure.Identity;
using Panissimo.Infrastructure.Inventory;
using Panissimo.Infrastructure.Persistence;
using Panissimo.Infrastructure.Persistence.Interceptors;
using Panissimo.Infrastructure.Persistence.Seed;

namespace Panissimo.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// No Kerberos: with GSS encryption left on "prefer", Npgsql probes it on new connections and logs a missing
    /// libgssapi_krb5 in the aspnet image. A connection string that sets it explicitly keeps its value.
    /// </summary>
    public static string WithoutKerberos(string connectionString) =>
        connectionString.Contains("GSS Encryption Mode", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("GssEncryptionMode", StringComparison.OrdinalIgnoreCase)
            ? connectionString
            : new NpgsqlConnectionStringBuilder(connectionString) { GssEncryptionMode = GssEncryptionMode.Disable }.ConnectionString;

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
            return NpgsqlDataSource.Create(WithoutKerberos(connectionString));
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
        services.AddScoped<PrivilegeGuard>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IRoleService, RoleService>();
        services.AddScoped<IAuditLogQueries, AuditLogQueries>();
        services.AddScoped<ILocationService, LocationService>();
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddSingleton<ICsvReader, CsvFileReader>();
        services.AddScoped<IUnitOfMeasureService, UnitOfMeasureService>();
        services.AddScoped<IItemCategoryService, ItemCategoryService>();
        services.AddScoped<IFleetService, FleetService>();
        services.AddScoped<IItemService, ItemService>();
        services.AddScoped<IItemImportService, ItemImportService>();
        services.AddScoped<IInventoryPostingService, InventoryPostingService>();
        services.AddScoped<ILotAllocator, LotAllocator>();
        services.AddScoped<ILotRegistry, LotRegistry>();
        services.AddScoped<IStockQueries, StockQueries>();
        services.AddScoped<IAdjustmentService, AdjustmentService>();
        services.AddScoped<IInitialStockImportService, InitialStockImportService>();
        services.AddScoped<IInventorySnapshotReader, InventorySnapshotReader>();
        services.AddScoped<IPhysicalCountService, PhysicalCountService>();
        services.AddScoped<IConsumptionService, ConsumptionService>();
        services.AddScoped<ITransferLinks, BranchOrderTransferLinks>();
        services.AddScoped<IBranchOrderService, BranchOrderService>();
        services.AddScoped<ITransferService, TransferService>();
        services.AddScoped<IRecipeService, RecipeService>();
        services.AddScoped<IProductionOrderService, ProductionOrderService>();
        services.AddScoped<IProductionCloseService, ProductionCloseService>();
        services.AddSingleton<IExcelOrderReader, ClosedXmlOrderReader>();
        services.AddScoped<IProductionOrderImportService, ProductionOrderImportService>();
        services.AddScoped<IDemandSource, BranchOrderDemandSource>();
        services.AddScoped<IDemandSource, CustomerOrderDemandSource>();
        services.AddScoped<IDemandSource, ParentOrderDemandSource>();
        services.AddScoped<IProductionPlanService, ProductionPlanService>();
        services.AddScoped<ISupplierService, SupplierService>();
        services.AddScoped<IRequisitionService, RequisitionService>();
        services.AddScoped<IMaterialRequirementService, MaterialRequirementService>();
        services.AddScoped<IProductionSummaryService, ProductionSummaryService>();
        services.AddScoped<IDashboardService, DashboardService>();
        services.AddScoped<IPendingTasksService, PendingTasksService>();
        services.AddScoped<IItemPhotoService, ItemPhotoService>();
        services.AddScoped<ITraceDataSource, TraceabilityQueries>();
        services.AddScoped<ITraceabilityService, TraceabilityService>();
        services.AddScoped<IConsumptionAnalysisService, ConsumptionAnalysisService>();
        services.AddScoped<IPurchaseOrderService, PurchaseOrderService>();
        services.AddScoped<IGoodsReceiptService, GoodsReceiptService>();
        services.AddScoped<ICustomerService, CustomerService>();
        services.AddScoped<ICustomerOrderService, CustomerOrderService>();
        services.AddScoped<ICustomerShipmentService, CustomerShipmentService>();

        services.Configure<SeedOptions>(configuration.GetSection(SeedOptions.Section));
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.Section));
        services.AddScoped<DatabaseSeeder>();
        services.AddScoped<SampleDataSeeder>();

        return services;
    }
}
