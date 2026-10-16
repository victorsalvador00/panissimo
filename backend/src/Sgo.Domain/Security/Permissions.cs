namespace Sgo.Domain.Security;

/// <summary>Fixed permission catalog (dominio §6).</summary>
public static class Permissions
{
    public const string LocationsView = "locations.view";
    public const string LocationsManage = "locations.manage";
    public const string LocationsAll = "locations.all";

    public const string CatalogView = "catalog.view";
    public const string CatalogManage = "catalog.manage";

    public const string InventoryView = "inventory.view";
    public const string InventoryAdjust = "inventory.adjust";
    public const string InventoryCount = "inventory.count";
    public const string InventoryConsumption = "inventory.consumption";

    public const string ProductionView = "production.view";
    public const string ProductionRecipesManage = "production.recipes.manage";
    public const string ProductionOrdersManage = "production.orders.manage";
    public const string ProductionOrdersComplete = "production.orders.complete";

    public const string LogisticsView = "logistics.view";
    public const string LogisticsOrdersCreate = "logistics.orders.create";
    public const string LogisticsOrdersApprove = "logistics.orders.approve";
    public const string LogisticsTransfersDispatch = "logistics.transfers.dispatch";
    public const string LogisticsTransfersReceive = "logistics.transfers.receive";

    /// <summary>Decisión abierta 4: routes other than factory/commissary → branch (between branches, factory ↔ commissary, returns).</summary>
    public const string LogisticsTransfersSpecial = "logistics.transfers.special";

    public const string PurchasingView = "purchasing.view";
    public const string PurchasingSuppliersManage = "purchasing.suppliers.manage";
    public const string PurchasingRequisitionsManage = "purchasing.requisitions.manage";
    public const string PurchasingPoManage = "purchasing.po.manage";
    public const string PurchasingPoApprove = "purchasing.po.approve";
    public const string PurchasingReceive = "purchasing.receive";

    public const string SecurityUsersManage = "security.users.manage";
    public const string SecurityRolesManage = "security.roles.manage";
    public const string SecurityAuditView = "security.audit.view";

    public const string SettingsManage = "settings.manage";

    public sealed record Definition(string Code, string Module, string Description);

    public static readonly IReadOnlyList<Definition> All =
    [
        new(LocationsView, "Organización", "Ver ubicaciones"),
        new(LocationsManage, "Organización", "Administrar ubicaciones"),
        new(LocationsAll, "Organización", "Acceso a todas las ubicaciones"),
        new(CatalogView, "Catálogos", "Ver catálogos"),
        new(CatalogManage, "Catálogos", "Administrar catálogos"),
        new(InventoryView, "Inventario", "Ver inventario"),
        new(InventoryAdjust, "Inventario", "Registrar ajustes de inventario"),
        new(InventoryCount, "Inventario", "Realizar conteos físicos"),
        new(InventoryConsumption, "Inventario", "Registrar consumos"),
        new(ProductionView, "Producción", "Ver producción"),
        new(ProductionRecipesManage, "Producción", "Administrar recetas"),
        new(ProductionOrdersManage, "Producción", "Administrar órdenes de producción"),
        new(ProductionOrdersComplete, "Producción", "Completar órdenes de producción"),
        new(LogisticsView, "Logística", "Ver logística"),
        new(LogisticsOrdersCreate, "Logística", "Crear pedidos de sucursal"),
        new(LogisticsOrdersApprove, "Logística", "Aprobar pedidos de sucursal"),
        new(LogisticsTransfersDispatch, "Logística", "Despachar traspasos"),
        new(LogisticsTransfersReceive, "Logística", "Recibir traspasos"),
        new(LogisticsTransfersSpecial, "Logística", "Traspasos entre sucursales, entre fábrica y comisariato, y devoluciones"),
        new(PurchasingView, "Compras", "Ver compras"),
        new(PurchasingSuppliersManage, "Compras", "Administrar proveedores"),
        new(PurchasingRequisitionsManage, "Compras", "Administrar requisiciones"),
        new(PurchasingPoManage, "Compras", "Administrar órdenes de compra"),
        new(PurchasingPoApprove, "Compras", "Aprobar órdenes de compra"),
        new(PurchasingReceive, "Compras", "Recibir compras"),
        new(SecurityUsersManage, "Seguridad", "Administrar usuarios"),
        new(SecurityRolesManage, "Seguridad", "Administrar roles"),
        new(SecurityAuditView, "Seguridad", "Ver bitácora"),
        new(SettingsManage, "Configuración", "Administrar configuración"),
    ];

    public static readonly IReadOnlySet<string> Codes = All.Select(p => p.Code).ToHashSet();

    public static bool IsValid(string code) => Codes.Contains(code);
}
