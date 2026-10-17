using System.Text.Json.Nodes;
using Microsoft.OpenApi;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Application.Sales;
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
        [typeof(CreateProductionOrderRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a9", "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9",
              "plannedQty": 3200, "scheduledDate": "2026-10-17", "productionAreaId": null, "shift": "Night", "notes": "Pedido de fin de semana" }
            """,
        [typeof(UpdateProductionOrderRequest)] = """
            { "version": 1234, "outputItemId": "0199a1b2-0000-7000-8000-0000000000d9", "plannedQty": 3000,
              "scheduledDate": "2026-10-17", "productionAreaId": "0199a1b2-0000-7000-8000-0000000000e1", "shift": "Night", "notes": null }
            """,
        [typeof(CreateProductionCloseRequest)] = """
            { "version": 1234, "kind": "Partial", "producedQty": 1200, "shift": "Night", "notes": "Primer tramo",
              "shortfallReason": null, "shortfallNotes": null,
              "lines": [ { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d1", "actualQty": 62.4, "lots": null },
                         { "componentItemId": "0199a1b2-0000-7000-8000-0000000000d2", "actualQty": 12,
                           "lots": [ { "lotId": "0199a1b2-0000-7000-8000-0000000000f1", "qty": 12 } ] } ] }
            """,
        [typeof(UpdateSettingsRequest)] = """
            { "settings": [ { "key": "production.overrun_tolerance_pct", "value": 8, "version": 1234 },
                            { "key": "production.plan_default_days", "value": 2, "version": 1235 } ] }
            """,
        [typeof(CreateBranchOrderRequest)] = """
            { "requestingLocationId": "0199a1b2-0000-7000-8000-0000000000a9", "requiredDate": "2026-10-18", "notes": "Fin de semana",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "requestedQty": 120 },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "requestedQty": 2 } ] }
            """,
        [typeof(UpdateBranchOrderRequest)] = """
            { "version": 1234, "requiredDate": "2026-10-19", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "requestedQty": 150 } ] }
            """,
        [typeof(ApproveBranchOrderRequest)] = """
            { "version": 1234, "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000c1", "approvedQty": 100 },
                                          { "lineId": "0199a1b2-0000-7000-8000-0000000000c2", "approvedQty": 0 } ] }
            """,
        [typeof(RejectBranchOrderRequest)] = """{ "version": 1234, "reason": "Sin producción ese día" }""",
        [typeof(CreateCustomerRequest)] = """
            { "code": "CLI-001", "name": "Cafeterías del Bajío S.A. de C.V.", "taxId": "CBA010522AT1", "contactName": "Marta Ruiz",
              "phone": "477 765 4321", "email": "compras@cafebajio.mx", "notes": null }
            """,
        [typeof(UpdateCustomerRequest)] = """
            { "version": 1234, "name": "Cafeterías del Bajío S.A. de C.V.", "taxId": null, "contactName": "Marta Ruiz",
              "phone": "477 765 4321", "email": "compras@cafebajio.mx", "notes": "Recibe de 7 a 10", "isActive": true }
            """,
        [typeof(CreateDeliveryPointRequest)] = """{ "name": "Sucursal Centro", "address": "Madero 120, León, Gto." }""",
        [typeof(UpdateDeliveryPointRequest)] = """{ "version": 1234, "name": "Sucursal Centro", "address": "Madero 122, León, Gto.", "isActive": true }""",
        [typeof(CreateCustomerItemRequest)] = """{ "itemId": "0199a1b2-0000-7000-8000-0000000000d3", "customerSku": "PAN-CONCHA-6", "price": 42.5 }""",
        [typeof(UpdateCustomerItemRequest)] = """{ "version": 1234, "customerSku": "PAN-CONCHA-6", "price": 44, "isActive": true }""",
        [typeof(CreateCustomerOrderRequest)] = """
            { "customerId": "0199a1b2-0000-7000-8000-0000000000f5", "deliveryPointId": null, "requiredDate": "2026-10-20",
              "customerReference": "OC-7781", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d3", "quantity": 120, "unitPrice": null } ] }
            """,
        [typeof(UpdateCustomerOrderRequest)] = """
            { "version": 1234, "deliveryPointId": "0199a1b2-0000-7000-8000-0000000000f6", "requiredDate": "2026-10-21",
              "customerReference": "OC-7781", "notes": "Entregar en andén 2",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d3", "quantity": 150, "unitPrice": 42.5 } ] }
            """,
        [typeof(CloseCustomerOrderRequest)] = """{ "version": 1234, "reason": "El cliente ya no requiere el saldo" }""",
        [typeof(UpdateCustomerShipmentRequest)] = """
            { "version": 1234, "notes": "Entregar por andén 2",
              "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000c1", "quantity": 96 },
                         { "lineId": "0199a1b2-0000-7000-8000-0000000000c2", "quantity": 0 } ] }
            """,
        [typeof(DispatchCustomerShipmentRequest)] = """
            { "version": 1234, "vehicleDescription": "Camioneta 3 (GTO-12-345)", "driverName": "Luis Pérez", "receivedByName": null,
              "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000c1",
                           "lots": [ { "lotId": "0199a1b2-0000-7000-8000-0000000000f1", "qty": 60 },
                                     { "lotId": "0199a1b2-0000-7000-8000-0000000000f2", "qty": 36 } ] } ] }
            """,
        [typeof(GenerateProductionPlanRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a1",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "date": "2026-10-18", "areaId": null, "shift": "Night",
                           "quantity": 1200, "demandLineIds": null },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d3", "date": "2026-10-18", "areaId": null, "shift": null,
                           "quantity": 96, "demandLineIds": ["0199a1b2-0000-7000-8000-0000000000c7"] } ] }
            """,
        [typeof(CreateSupplierRequest)] = """
            { "taxId": "HAM980312AB5", "name": "Harinera del Bajío S.A. de C.V.", "contactName": "Jorge Ríos",
              "phone": "477 123 4567", "email": "ventas@harinerabajio.mx", "paymentTermsDays": 30 }
            """,
        [typeof(UpdateSupplierRequest)] = """
            { "version": 1234, "taxId": "HAM980312AB5", "name": "Harinera del Bajío S.A. de C.V.", "contactName": "Jorge Ríos",
              "phone": "477 123 4567", "email": "ventas@harinerabajio.mx", "paymentTermsDays": 45, "isActive": true }
            """,
        [typeof(CreateSupplierItemRequest)] = """
            { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "supplierSku": "HAR-PAN-44", "price": 612.5,
              "leadTimeDays": 3, "isPreferred": true }
            """,
        [typeof(UpdateSupplierItemRequest)] = """
            { "version": 1234, "supplierSku": "HAR-PAN-44", "price": 598, "leadTimeDays": 2, "isPreferred": true, "isActive": true }
            """,
        [typeof(CreateRequisitionRequest)] = """
            { "locationId": "0199a1b2-0000-7000-8000-0000000000a1", "neededBy": "2026-10-24", "notes": "Semana de muertos",
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 40, "suggestedSupplierId": null },
                         { "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 12,
                           "suggestedSupplierId": "0199a1b2-0000-7000-8000-0000000000e1" } ] }
            """,
        [typeof(UpdateRequisitionRequest)] = """
            { "version": 1234, "neededBy": "2026-10-25", "notes": null,
              "lines": [ { "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 45, "suggestedSupplierId": null } ] }
            """,
        [typeof(RejectRequisitionRequest)] = """{ "version": 1234, "reason": "Hay existencia suficiente para la semana" }""",
        [typeof(CreatePurchaseOrderRequest)] = """
            { "supplierId": "0199a1b2-0000-7000-8000-0000000000e1", "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a1",
              "expectedDate": "2026-10-22", "notes": null,
              "lines": [ { "lineId": null, "itemId": "0199a1b2-0000-7000-8000-0000000000d1", "quantity": 40, "unitPrice": null },
                         { "lineId": null, "itemId": "0199a1b2-0000-7000-8000-0000000000d2", "quantity": 6, "unitPrice": 88.5 } ] }
            """,
        [typeof(UpdatePurchaseOrderRequest)] = """
            { "version": 1234, "deliveryLocationId": "0199a1b2-0000-7000-8000-0000000000a1", "expectedDate": "2026-10-23", "notes": "Entregar antes de las 7:00",
              "lines": [ { "lineId": "0199a1b2-0000-7000-8000-0000000000c1", "itemId": "0199a1b2-0000-7000-8000-0000000000d1",
                           "quantity": 45, "unitPrice": 598 } ] }
            """,
        [typeof(RejectPurchaseOrderRequest)] = """{ "version": 1234, "reason": "Precio arriba de lo cotizado" }""",
        [typeof(CreateGoodsReceiptRequest)] = """
            { "purchaseOrderId": "0199a1b2-0000-7000-8000-0000000000b9", "poVersion": 1234, "supplierInvoiceNumber": "A-15873", "notes": null,
              "lines": [ { "poLineId": "0199a1b2-0000-7000-8000-0000000000c1", "quantity": 30, "lotNumber": "L2610-A", "expirationDate": "2027-04-30" },
                         { "poLineId": "0199a1b2-0000-7000-8000-0000000000c1", "quantity": 10, "lotNumber": "L2610-B", "expirationDate": null } ] }
            """,
        [typeof(ConvertRequisitionsRequest)] = """
            { "requisitionIds": ["0199a1b2-0000-7000-8000-0000000000b1", "0199a1b2-0000-7000-8000-0000000000b2"] }
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
