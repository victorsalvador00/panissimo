using System.Text.Json.Nodes;
using Microsoft.OpenApi;
using Panissimo.Application.Security;

namespace Panissimo.Api.OpenApi;

public static class OpenApiSetup
{
    /// <summary>Request examples shown in the OpenAPI document (definition of done). Each task adds its DTOs.</summary>
    private static readonly Dictionary<Type, string> RequestExamples = new()
    {
        [typeof(LoginRequest)] = """{ "email": "jefe.produccion@panissimo.mx", "password": "Contrasena2026" }""",
        [typeof(ChangePasswordRequest)] = """{ "currentPassword": "Contrasena2026", "newPassword": "NuevaContrasena2027" }""",
    };

    public static IServiceCollection AddPanissimoOpenApi(this IServiceCollection services) =>
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Title = "SGO Paníssimo API";
                document.Info.Version = "v1";
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
                document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
                {
                    Type = SecuritySchemeType.Http,
                    Scheme = "bearer",
                    BearerFormat = "JWT",
                    Description = "Access token obtenido en POST /api/v1/auth/login",
                };
                document.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] }];
                return Task.CompletedTask;
            });

            options.AddSchemaTransformer((schema, context, _) =>
            {
                if (RequestExamples.TryGetValue(context.JsonTypeInfo.Type, out var json))
                    schema.Examples = [JsonNode.Parse(json)!];
                return Task.CompletedTask;
            });
        });
}
