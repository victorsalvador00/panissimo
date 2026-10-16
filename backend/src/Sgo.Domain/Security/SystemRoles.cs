using static Sgo.Domain.Security.Permissions;

namespace Sgo.Domain.Security;

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
    // "Todos los *.view" = module views. The audit log is not included: the spec grants
    // security.audit.view explicitly (and separately) only to the operations manager.
    private static IEnumerable<string> Views =>
        Matching(c => c.EndsWith(".view", StringComparison.Ordinal) && c != SecurityAuditView);
    private static IEnumerable<string> Module(string prefix) => Matching(c => c.StartsWith(prefix + ".", StringComparison.Ordinal));

    public static readonly IReadOnlyList<Definition> All =
    [
        new(AdministratorKey, Administrator, "Acceso total al sistema", [.. Codes]),
        new("operations_manager", "Gerente de operaciones", "Consulta general, aprobaciones y bitácora",
            [.. Views, LogisticsOrdersApprove, PurchasingPoApprove, LocationsAll, SecurityAuditView, LogisticsTransfersSpecial]),
        new("purchasing", "Compras", "Proveedores, requisiciones, órdenes de compra y recepciones",
            [.. Module("purchasing").Where(c => c != PurchasingPoApprove), CatalogView, InventoryView]),
        new("production_manager", "Jefe de producción", "Recetas y órdenes de producción",
            [.. Module("production"), InventoryView, InventoryCount, CatalogView]),
        new("warehouse", "Almacén comisariato/fábrica", "Inventario, despacho de traspasos y recepción de compras",
            [.. Module("inventory"), LogisticsView, LogisticsOrdersApprove, LogisticsTransfersDispatch, LogisticsTransfersSpecial,
                PurchasingReceive, PurchasingView]),
        new("branch_manager", "Encargado de sucursal", "Operación diaria de sucursal",
            [InventoryView, InventoryCount, InventoryConsumption, LogisticsView, LogisticsOrdersCreate, LogisticsTransfersReceive]),
        new("read_only", "Consulta", "Solo lectura", [.. Views]),
    ];
}
