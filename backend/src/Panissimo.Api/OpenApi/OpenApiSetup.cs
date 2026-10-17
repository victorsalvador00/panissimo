using System.Text.Json.Nodes;
using Microsoft.OpenApi;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
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
        [typeof(CreateUnitOfMeasureRequest)] = """{ "code": "bolsa", "name": "Bolsa", "kind": "Unit" }""",
        [typeof(UpdateUnitOfMeasureRequest)] = """{ "version": 1234, "name": "Bolsa", "kind": "Unit", "isActive": true }""",
        [typeof(CreateItemCategoryRequest)] = """{ "name": "Pan dulce" }""",
        [typeof(UpdateItemCategoryRequest)] = """{ "version": 1234, "name": "Pan dulce", "isActive": true }""",
        [typeof(CreateProductionAreaRequest)] = """{ "code": "HOJ-NOC", "name": "Hojaldre Noche", "sortOrder": 120 }""",
        [typeof(UpdateProductionAreaRequest)] = """{ "version": 1234, "name": "Hojaldre Noche", "sortOrder": 120, "isActive": true }""",
        [typeof(CreateItemRequest)] = """
            { "sku": "TRENZA-EMB", "name": "Trenza embolsada 6 pzas", "type": "FinishedGood",
              "categoryId": "0199a1b2-0000-7000-8000-0000000000c1", "baseUomId": "0199a1b2-0000-7000-8000-0000000000b5",
              "purchaseUomId": null, "purchaseToBaseFactor": null, "tracksLots": true, "shelfLifeDays": 5,
              "storageCondition": "Ambient", "taxRate": 0, "presentation": "Packaged",
              "bulkItemId": "0199a1b2-0000-7000-8000-0000000000d9", "unitsPerPackage": 6,
              "productionAreaId": "0199a1b2-0000-7000-8000-0000000000e1", "productionMultiple": 6, "unitWeightGrams": 85 }
            """,
        [typeof(UpdateItemRequest)] = """
            { "version": 1234, "sku": "HAR-001", "name": "Harina de trigo", "type": "RawMaterial",
              "categoryId": "0199a1b2-0000-7000-8000-0000000000c1", "baseUomId": "0199a1b2-0000-7000-8000-0000000000b1",
              "purchaseUomId": "0199a1b2-0000-7000-8000-0000000000b7", "purchaseToBaseFactor": 44, "tracksLots": true,
              "shelfLifeDays": 180, "storageCondition": "Ambient", "taxRate": 0, "presentation": null, "bulkItemId": null,
              "unitsPerPackage": null, "productionAreaId": null, "productionMultiple": 1, "unitWeightGrams": null, "isActive": true }
            """,
        [typeof(UpdateItemLocationSettingsRequest)] = """
            { "settings": [
                { "locationId": "0199a1b2-0000-7000-8000-0000000000a9", "minQty": 200, "maxQty": 600 },
                { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "minQty": null, "maxQty": null } ] }
            """,
        [typeof(CreateAdjustmentRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a9", "reason": "Correction", "notes": "Diferencia en revisión",
              "lines": [
                { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "lotNumber": "L-2610", "expirationDate": "2027-03-31",
                  "quantity": 5, "unitCost": 18.5, "notes": null },
                { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "lotId": null, "lotNumber": null, "expirationDate": null,
                  "quantity": -2, "unitCost": null, "notes": "Bolsa rota" } ] }
            """,
        [typeof(CreatePhysicalCountRequest)] = """{ "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "categoryId": null, "notes": "Conteo semanal" }""",
        [typeof(UpdatePhysicalCountRequest)] = """
            { "version": 1234, "categoryId": null, "notes": "Conteo semanal",
              "counts": [
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e1", "itemId": null, "lotId": null, "lotNumber": null, "expirationDate": null, "countedQty": 7 },
                { "lineId": null, "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "lotNumber": "OP-000123-01", "expirationDate": null, "countedQty": 24 } ] }
            """,
        [typeof(AddCountLineRequest)] = """{ "version": 1234, "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "lotNumber": "OP-000123-02", "expirationDate": null }""",
        [typeof(CreateConsumptionRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "businessDate": "2026-10-16", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 36 } ] }
            """,
        [typeof(CreateTransferRequest)] = """
            { "fromLocationId": "0199a1b2-0000-7000-8000-0000000000a9", "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
              "notes": "Reposición de la tarde", "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 120 } ] }
            """,
        [typeof(UpdateTransferRequest)] = """
            { "version": 1234, "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 150 } ] }
            """,
        [typeof(DispatchTransferRequest)] = """
            { "version": 1234, "vehicleDescription": "Nissan NP300 blanca ABC-123", "driverName": "Juan Pérez",
              "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
                           "lots": [ { "lotId": "0199a1b2-0000-7000-8000-0000000000f1", "qty": 100 },
                                     { "lotId": "0199a1b2-0000-7000-8000-0000000000f2", "qty": 20 } ] } ] }
            """,
        [typeof(ReceiveTransferRequest)] = """
            { "version": 1234, "lines": [
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e1", "receivedQty": 100, "discrepancyReason": null, "discrepancyNotes": null },
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e2", "receivedQty": 18, "discrepancyReason": "Damaged", "discrepancyNotes": "Charola aplastada" } ] }
            """,
        [typeof(CreateRecipeRequest)] = """
            { "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9", "yieldQty": 120, "notes": "Masa de bizcocho, batida de 120 pza",
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 6.5, "wastePct": 2 },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 1.2, "wastePct": 0 } ] }
            """,
        [typeof(UpdateRecipeRequest)] = """
            { "version": 1234, "yieldQty": 120, "notes": "Menos azúcar",
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 6.5, "wastePct": 2 },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 1.0, "wastePct": 0 } ] }
            """,
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
