using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Logistics;
using Sgo.Application.Organization;
using Sgo.Application.Production;
using Sgo.Application.Purchasing;
using Sgo.Application.Security;

namespace Sgo.Api.OpenApi;

public static class OpenApiSetup
{
    /// <summary>Request examples shown in the OpenAPI document (definition of done).</summary>
    private static readonly Dictionary<Type, string> RequestExamples = new()
    {
        [typeof(LoginRequest)] = """{ "email": "encargado.suc01@ejemplo.mx", "password": "Contrasena123" }""",
        [typeof(ChangePasswordRequest)] = """{ "currentPassword": "Contrasena123", "newPassword": "NuevaContrasena456" }""",
        [typeof(CreateUserRequest)] = """
            { "email": "encargado.suc01@ejemplo.mx", "fullName": "Laura Méndez", "password": "Temporal2024x",
              "roleIds": ["0199a1b2-0000-7000-8000-000000000001"],
              "locationIds": ["0199a1b2-0000-7000-8000-0000000000a1"], "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a1" }
            """,
        [typeof(UpdateUserRequest)] = """
            { "version": 1234, "fullName": "Laura Méndez Ruiz",
              "roleIds": ["0199a1b2-0000-7000-8000-000000000001"],
              "locationIds": ["0199a1b2-0000-7000-8000-0000000000a1", "0199a1b2-0000-7000-8000-0000000000a2"],
              "defaultLocationId": "0199a1b2-0000-7000-8000-0000000000a1" }
            """,
        [typeof(ResetPasswordRequest)] = """{ "newPassword": "Temporal2024x" }""",
        [typeof(VersionRequest)] = """{ "version": 1234 }""",
        [typeof(CreateRoleRequest)] = """
            { "name": "Supervisor de sucursales", "description": "Consulta y aprobación de pedidos",
              "permissions": ["inventory.view", "logistics.view", "logistics.orders.approve"] }
            """,
        [typeof(UpdateRoleRequest)] = """
            { "version": 1234, "name": "Supervisor de sucursales", "description": "Consulta y aprobación de pedidos",
              "permissions": ["inventory.view", "logistics.view", "logistics.orders.approve", "locations.view"] }
            """,
        [typeof(CreateLocationRequest)] = """{ "code": "SUC-11", "name": "Sucursal Plaza Sur", "type": "Branch", "address": "Av. Sur 200" }""",
        [typeof(CreateUnitOfMeasureRequest)] = """{ "code": "bolsa", "name": "Bolsa", "kind": "Unit" }""",
        [typeof(UpdateUnitOfMeasureRequest)] = """{ "version": 1234, "name": "Bolsa", "kind": "Unit", "isActive": true }""",
        [typeof(CreateItemCategoryRequest)] = """{ "name": "Lácteos" }""",
        [typeof(UpdateItemCategoryRequest)] = """{ "version": 1234, "name": "Lácteos y derivados", "isActive": true }""",
        [typeof(CreateItemRequest)] = """
            { "sku": "HAR-001", "name": "Harina de trigo", "type": "RawMaterial",
              "categoryId": "0199a1b2-0000-7000-8000-0000000000c1", "baseUomId": "0199a1b2-0000-7000-8000-0000000000b1",
              "purchaseUomId": "0199a1b2-0000-7000-8000-0000000000b2", "purchaseToBaseFactor": 25,
              "tracksLots": true, "shelfLifeDays": 180, "storageCondition": "Ambient", "taxRate": 0 }
            """,
        [typeof(UpdateItemRequest)] = """
            { "version": 1234, "sku": "HAR-001", "name": "Harina de trigo 25 kg", "type": "RawMaterial",
              "categoryId": "0199a1b2-0000-7000-8000-0000000000c1", "baseUomId": "0199a1b2-0000-7000-8000-0000000000b1",
              "purchaseUomId": "0199a1b2-0000-7000-8000-0000000000b2", "purchaseToBaseFactor": 25,
              "tracksLots": true, "shelfLifeDays": 180, "storageCondition": "Ambient", "taxRate": 0, "isActive": true }
            """,
        [typeof(UpdateItemLocationSettingsRequest)] = """
            { "settings": [
                { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "minQty": 10, "maxQty": 40 },
                { "locationId": "0199a1b2-0000-7000-8000-0000000000a2", "minQty": null, "maxQty": null } ] }
            """,
        [typeof(CreateAdjustmentRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "reason": "Correction", "notes": "Diferencia en revisión",
              "lines": [
                { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "lotNumber": "L-2409", "expirationDate": "2027-03-31",
                  "quantity": 5, "unitCost": 18.5, "notes": null },
                { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "lotId": null, "lotNumber": null, "expirationDate": null,
                  "quantity": -2, "unitCost": null, "notes": "Bolsa rota" } ] }
            """,
        [typeof(CreatePhysicalCountRequest)] = """{ "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "categoryId": null, "notes": "Conteo semanal" }""",
        [typeof(UpdatePhysicalCountRequest)] = """
            { "version": 1234, "categoryId": null, "notes": "Conteo semanal",
              "counts": [
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e1", "itemId": null, "lotId": null, "lotNumber": null, "expirationDate": null, "countedQty": 7 },
                { "lineId": null, "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "lotNumber": "L-2410", "expirationDate": "2027-01-15", "countedQty": 2 } ] }
            """,
        [typeof(CreateConsumptionRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "businessDate": "2026-09-23", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 1.5 } ] }
            """,
        [typeof(CreateTransferRequest)] = """
            { "fromLocationId": "0199a1b2-0000-7000-8000-0000000000a9", "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
              "notes": "Reposición semanal", "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 12 } ] }
            """,
        [typeof(UpdateTransferRequest)] = """
            { "version": 1234, "toLocationId": "0199a1b2-0000-7000-8000-0000000000a1", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "lotId": null, "quantity": 15 } ] }
            """,
        [typeof(DispatchTransferRequest)] = """
            { "version": 1234, "vehicleDescription": "Nissan NP300 blanca ABC-123", "driverName": "Juan Pérez",
              "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000e1",
                           "lots": [ { "lotId": "0199a1b2-0000-7000-8000-0000000000f1", "quantity": 10 },
                                     { "lotId": "0199a1b2-0000-7000-8000-0000000000f2", "quantity": 2 } ] } ] }
            """,
        [typeof(ReceiveTransferRequest)] = """
            { "version": 1234, "lines": [
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e1", "receivedQty": 10, "discrepancyReason": null, "discrepancyNotes": null },
                { "lineId": "0199a1b2-0000-7000-8000-0000000000e2", "receivedQty": 1, "discrepancyReason": "Damaged", "discrepancyNotes": "Caja aplastada" } ] }
            """,
        [typeof(CreateRecipeRequest)] = """
            { "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9", "yieldQty": 12, "notes": "Pan de muerto, charola de 12",
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 1.2, "wastePct": 3 },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 0.25, "wastePct": 0 } ] }
            """,
        [typeof(UpdateRecipeRequest)] = """
            { "version": 1234, "yieldQty": 12, "notes": "Menos azúcar", "isActive": true,
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 1.2, "wastePct": 3 },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 0.2, "wastePct": 0 } ] }
            """,
        [typeof(CreateProductionOrderRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a9", "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9",
              "plannedQty": 120, "scheduledDate": "2026-09-25", "notes": "Turno matutino" }
            """,
        [typeof(UpdateProductionOrderRequest)] = """{ "version": 1234, "plannedQty": 96, "scheduledDate": "2026-09-26", "notes": null }""",
        [typeof(CompleteProductionOrderRequest)] = """
            { "version": 1234, "producedQty": 114,
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "actualQty": 12.5, "lots": null },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "actualQty": 3,
                           "lots": [ { "lotId": "0199a1b2-0000-7000-8000-0000000000f1", "quantity": 3 } ] } ] }
            """,
        [typeof(CreateSupplierRequest)] = """
            { "taxId": "HPA010203AB1", "name": "Harinas del Pacífico SA de CV", "contactName": "Marta Ríos",
              "phone": "33 1234 5678", "email": "ventas@harinaspacifico.mx", "paymentTermsDays": 30 }
            """,
        [typeof(UpdateSupplierRequest)] = """
            { "version": 1234, "taxId": "HPA010203AB1", "name": "Harinas del Pacífico SA de CV", "contactName": "Marta Ríos",
              "phone": "33 1234 5678", "email": "ventas@harinaspacifico.mx", "paymentTermsDays": 45, "isActive": true }
            """,
        [typeof(CreateSupplierItemRequest)] = """
            { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "supplierSku": "HP-TRIGO-25", "price": 412.5,
              "leadTimeDays": 3, "isPreferred": true }
            """,
        [typeof(UpdateSupplierItemRequest)] = """
            { "version": 1234, "supplierSku": "HP-TRIGO-25", "price": 425, "leadTimeDays": 2, "isPreferred": true, "isActive": true }
            """,
        [typeof(CreateRequisitionRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a9", "neededBy": "2026-10-01", "notes": "Reposición quincenal",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 8, "suggestedSupplierId": null },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 2.5,
                           "suggestedSupplierId": "0199a1b2-0000-7000-8000-00000000005a" } ] }
            """,
        [typeof(UpdateRequisitionRequest)] = """
            { "version": 1234, "neededBy": "2026-10-02", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 10, "suggestedSupplierId": null } ] }
            """,
        [typeof(RejectRequisitionRequest)] = """{ "version": 1234, "reason": "Hay existencia suficiente en comisariato" }""",
        [typeof(ConvertRequisitionsRequest)] = """
            { "requisitionIds": ["0199a1b2-0000-7000-8000-00000000007a", "0199a1b2-0000-7000-8000-00000000007b"] }
            """,
        [typeof(CreatePurchaseOrderRequest)] = """
            { "supplierId": "0199a1b2-0000-7000-8000-00000000005a", "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
              "expectedDate": "2026-10-01", "notes": "Entregar antes de las 10:00",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 10, "unitPrice": null },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 2, "unitPrice": 30.5 } ] }
            """,
        [typeof(UpdatePurchaseOrderRequest)] = """
            { "version": 1234, "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a9", "expectedDate": "2026-10-02", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 12, "unitPrice": 395,
                           "lineId": "0199a1b2-0000-7000-8000-0000000000e1" } ] }
            """,
        [typeof(RejectPurchaseOrderRequest)] = """{ "version": 1234, "reason": "Precio fuera de lo negociado" }""",
        [typeof(CreateGoodsReceiptRequest)] = """
            { "purchaseOrderId": "0199a1b2-0000-7000-8000-00000000007c", "poVersion": 1234, "supplierInvoiceNumber": "F-10234",
              "lines": [ { "poLineId": "0199a1b2-0000-7000-8000-0000000000e1", "quantity": 6, "lotNumber": "L-2410", "expirationDate": "2027-03-31" },
                         { "poLineId": "0199a1b2-0000-7000-8000-0000000000e1", "quantity": 4, "lotNumber": "L-2411", "expirationDate": null },
                         { "poLineId": "0199a1b2-0000-7000-8000-0000000000e2", "quantity": 2, "lotNumber": null, "expirationDate": null } ] }
            """,
        [typeof(CreateBranchOrderRequest)] = """
            { "requestingLocationId": "0199a1b2-0000-7000-8000-0000000000a1", "supplyingLocationId": "0199a1b2-0000-7000-8000-0000000000a9",
              "requiredDate": "2026-09-26", "notes": "Fin de semana largo",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d9", "requestedQty": 24 },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "requestedQty": 5.5 } ] }
            """,
        [typeof(UpdateBranchOrderRequest)] = """
            { "version": 1234, "supplyingLocationId": "0199a1b2-0000-7000-8000-0000000000a9", "requiredDate": "2026-09-27", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d9", "requestedQty": 30 } ] }
            """,
        [typeof(ApproveBranchOrderRequest)] = """
            { "version": 1234, "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000e1", "approvedQty": 20 },
                                          { "lineId": "0199a1b2-0000-7000-8000-0000000000e2", "approvedQty": 0 } ] }
            """,
        [typeof(RejectBranchOrderRequest)] = """{ "version": 1234, "reason": "Sin existencia hasta el lunes" }""",
        [typeof(UpdateSettingsRequest)] = """
            { "settings": [ { "key": "purchasing.po_approval_threshold", "value": 15000, "version": 1234 },
                            { "key": "inventory.expiration_alert_days", "value": 5, "version": 1235 } ] }
            """,
        [typeof(UpdateLocationRequest)] = """{ "version": 1234, "name": "Sucursal Centro", "address": "Av. Juárez 100, Col. Centro", "isActive": true }""",
    };

    public static IServiceCollection AddSgoOpenApi(this IServiceCollection services) =>
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Title = "SGO AR API";
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
