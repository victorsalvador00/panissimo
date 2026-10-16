using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Formatting.Compact;
using Sgo.Api;
using Sgo.Api.Auth;
using Sgo.Api.Middleware;
using Sgo.Api.OpenApi;
using Sgo.Api.Validation;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Infrastructure;
using Sgo.Infrastructure.Health;
using Sgo.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables(prefix: "SGO__");

builder.Services.AddSerilog((services, logger) =>
{
    logger.ReadFrom.Configuration(builder.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext();

    if (builder.Environment.IsDevelopment())
        logger.WriteTo.Console();
    else
        logger.WriteTo.Console(new CompactJsonFormatter());
});

builder.Services
    .AddControllers(options =>
    {
        options.Conventions.Add(new ApiRoutePrefixConvention());
        options.Conventions.Add(new DefaultSuccessResponseConvention());
        options.Filters.Add<ValidationFilter>();
        ModelStateProblem.UseSpanishMessages(options.ModelBindingMessageProvider);
    })
    .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = ModelStateProblem.Response)
    .AddJsonOptions(options =>
    {
        ConfigureJson(options.JsonSerializerOptions);
        // System.Text.Json messages name .NET types; ModelStateProblem gives a Spanish one instead.
        options.AllowInputFormatterExceptionMessages = false;
    });

// Same options for the minimal-API/OpenAPI serializer, so the documented schema matches the wire format.
builder.Services.ConfigureHttpJsonOptions(options => ConfigureJson(options.SerializerOptions));

builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context =>
    {
        ProblemDetailsMapper.Normalize(context.ProblemDetails);
        context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
    });
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

ValidatorOptions.Global.LanguageManager.Culture = new CultureInfo("es");
builder.Services.AddValidatorsFromAssemblyContaining<LoginRequestValidator>();

builder.Services.AddSgoOpenApi();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // The API is only reachable through Caddy inside the docker network.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddSgoAuth(builder.Configuration);

builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

var app = builder.Build();

// `dotnet Sgo.Api.dll --seed`: run the idempotent seed and exit (production, after the migration bundle).
if (args.Contains("--seed"))
{
    await DatabaseInitializer.InitializeAsync(app.Services, migrate: false, seed: true);
    return;
}

var databaseOptions = app.Services.GetRequiredService<IOptions<DatabaseOptions>>().Value;
await DatabaseInitializer.InitializeAsync(app.Services, databaseOptions.MigrateOnStartup, databaseOptions.SeedOnStartup);

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseSerilogRequestLogging(options =>
    options.EnrichDiagnosticContext = (diagnostics, http) =>
    {
        diagnostics.Set("UserId", http.User.FindFirst("sub")?.Value ?? "anonymous");
        diagnostics.Set("TraceId", http.TraceIdentifier);
    });

app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<UserAccessMiddleware>();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference().AllowAnonymous();
}

app.MapHealthChecks("/health/live", new() { Predicate = check => check.Tags.Contains("live") }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new() { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();

app.MapControllers();

app.Run();

// Enums travel as strings and numbers must be JSON numbers (not "12.5"): the OpenAPI schema then documents
// string enums and plain `number`, which the frontend's generated types rely on.
static void ConfigureJson(JsonSerializerOptions options)
{
    options.Converters.Add(new JsonStringEnumConverter());
    options.NumberHandling = JsonNumberHandling.Strict;
}

public partial class Program;
