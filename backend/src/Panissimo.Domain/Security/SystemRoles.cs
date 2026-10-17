using static Panissimo.Domain.Security.Permissions;

namespace Panissimo.Domain.Security;

/// <summary>
/// Predefined roles seeded on first run (dominio §6). They remain editable afterwards (name included),
/// so the seed identifies them by <see cref="Definition.Key"/>, never by name.
/// </summary>
public static class SystemRoles
{
    public const string AdministratorKey = "administrator";
    public const string Administrator = "Administrador";

    public sealed record Definition(string Key, string Name, string Description, IReadOnlyList<string> Permissions);

    private static IEnumerable<string> Matching(Func<string, bool> predicate) => Codes.Where(predicate);
    private static IEnumerable<string> Views => Matching(c => c.EndsWith(".view", StringComparison.Ordinal));
    private static IEnumerable<string> Module(string prefix) => Matching(c => c.StartsWith(prefix + ".", StringComparison.Ordinal));

    public static readonly IReadOnlyList<Definition> All =
    [
        new(AdministratorKey, Administrator, "Acceso total al sistema", [.. Codes]),
        new("direction", "Dirección", "Consulta general, aprobaciones y bitácora",
            [.. Views.Union([LocationsAll, LogisticsOrdersApprove, PurchasingPoApprove, SecurityAuditView, LogisticsTransfersSpecial])]),
        new("purchasing", "Compras", "Proveedores, requisiciones, órdenes de compra y recepciones",
            [.. Module("purchasing").Where(c => c != PurchasingPoApprove), CatalogView, InventoryView, ProductionView]),
        new("production_manager", "Jefe de producción", "Recetas, plan, órdenes, cierres e importación de producción",
            [.. Module("production"), InventoryView, InventoryCount, InventoryAdjust, CatalogView, SalesView, LogisticsView]),
        new("production_supervisor", "Supervisor de producción", "Cierres de producción en la línea",
            [ProductionView, ProductionOrdersClose, InventoryView, CatalogView]),
        new("plant_warehouse", "Almacén planta", "Inventario, despachos, recepción de compras y remisiones",
            [.. Module("inventory"), LogisticsView, LogisticsOrdersApprove, LogisticsTransfersDispatch, LogisticsTransfersSpecial,
                PurchasingView, PurchasingReceive, SalesView, SalesShipmentsDispatch]),
        new("distribution", "Distribución", "Despacho de traspasos y remisiones",
            [LogisticsView, LogisticsTransfersDispatch, SalesView, SalesShipmentsDispatch, InventoryView]),
        new("customer_sales", "Ventas a clientes", "Clientes y pedidos de cliente",
            [SalesView, SalesCustomersManage, SalesOrdersManage, InventoryView, ProductionView]),
        new("branch_manager", "Encargado de sucursal", "Operación diaria de sucursal",
            [InventoryView, InventoryCount, InventoryConsumption, InventoryInternalTransfers, LogisticsView, LogisticsOrdersCreate,
                LogisticsTransfersReceive]),
        new("read_only", "Consulta", "Solo lectura", [.. Views.Where(c => c != SecurityAuditView)]),
    ];
}
