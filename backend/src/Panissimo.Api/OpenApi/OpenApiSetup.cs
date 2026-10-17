using System.Text.Json.Nodes;
using Microsoft.OpenApi;
using Panissimo.Application.Common;
using Panissimo.Application.Organization;
using Panissimo.Application.Security;

namespace Panissimo.Api.OpenApi;

public static class OpenApiSetup
{
    /// <summary>Request examples shown in the OpenAPI document (definition of done). Each task adds its DTOs.</summary>
    private static readonly Dictionary<Type, string> RequestExamples = new()
    {
        [typeof(LoginRequest)] = """{ "email": "jefe.produccion@panissimo.mx", "password": "Contrasena2026" }""",
        [typeof(ChangePasswordRequest)] = """{ "currentPassword": "Contrasena2026", "newPassword": "NuevaContrasena2027" }""",
        [typeof(VersionRequest)] = """{ "version": 1234 }""",
        [typeof(CreateUserRequest)] = """
            { "email": "supervisor.noche@panissimo.mx", "fullName": "Laura Méndez", "password": "Temporal2026x",
              "roleIds": ["0199a1b2-0000-7000-8000-000000000001"],
              "locationIds": ["0199a1b2-0000-7000-8000-0000000000a9"], "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a9" }
            """,
        [typeof(UpdateUserRequest)] = """
            { "version": 1234, "fullName": "Laura Méndez Ruiz",
              "roleIds": ["0199a1b2-0000-7000-8000-000000000001"],
              "locationIds": ["0199a1b2-0000-7000-8000-0000000000a9"], "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a9" }
            """,
        [typeof(ResetPasswordRequest)] = """{ "newPassword": "Temporal2026x" }""",
        [typeof(CreateRoleRequest)] = """
            { "name": "Líder de línea", "description": "Cierres de producción de su área",
              "permissions": ["production.view", "production.orders.close"] }
            """,
        [typeof(UpdateRoleRequest)] = """
            { "version": 1234, "name": "Líder de línea", "description": "Cierres de producción e inventario",
              "permissions": ["production.view", "production.orders.close", "inventory.view"] }
            """,
        [typeof(CreateLocationRequest)] = """{ "code": "SUC-11", "name": "Sucursal Plaza Sur", "type": "Branch", "address": "Av. Sur 200" }""",
        [typeof(UpdateLocationRequest)] = """{ "version": 1234, "name": "Sucursal Centro", "address": "Av. Juárez 100, Col. Centro", "isActive": true }""",
        [typeof(UpdateSettingsRequest)] = """
            { "settings": [ { "key": "production.overrun_tolerance_pct", "value": 8, "version": 1234 },
                            { "key": "production.plan_default_days", "value": 2, "version": 1235 } ] }
            """,
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
