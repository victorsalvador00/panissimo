using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;

namespace Panissimo.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.Section));
        return services;
    }
}
