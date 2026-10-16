using Sgo.Domain.Security;
using static Sgo.Domain.Security.Permissions;

namespace Sgo.UnitTests.Domain;

public class SystemRolesTests
{
    private static IReadOnlyList<string> PermissionsOf(string role) =>
        SystemRoles.All.Single(r => r.Name == role).Permissions;

    [Fact]
    public void Catalog_has_the_29_permissions_of_the_spec() => Assert.Equal(29, Codes.Count);

    [Fact]
    public void Special_transfer_routes_go_to_warehouse_and_operations_manager()
    {
        Assert.Contains(LogisticsTransfersSpecial, PermissionsOf("Almacén comisariato/fábrica"));
        Assert.Contains(LogisticsTransfersSpecial, PermissionsOf("Gerente de operaciones"));
        Assert.DoesNotContain(LogisticsTransfersSpecial, PermissionsOf("Encargado de sucursal"));
    }

    [Fact]
    public void Every_role_uses_valid_permissions_without_duplicates() =>
        Assert.All(SystemRoles.All, r =>
        {
            Assert.All(r.Permissions, p => Assert.True(IsValid(p), p));
            Assert.Equal(r.Permissions.Count, r.Permissions.Distinct().Count());
        });

    [Fact]
    public void Administrator_has_all_permissions() =>
        Assert.Equal(Codes.Order(), PermissionsOf(SystemRoles.Administrator).Order());

    [Fact]
    public void Consulta_has_only_view_permissions() =>
        Assert.Equal(
            [CatalogView, InventoryView, LocationsView, LogisticsView, ProductionView, PurchasingView],
            PermissionsOf("Consulta").Order());

    [Fact]
    public void Operations_manager_gets_views_approvals_all_locations_and_audit()
    {
        var permissions = PermissionsOf("Gerente de operaciones");
        Assert.Contains(PurchasingPoApprove, permissions);
        Assert.Contains(LogisticsOrdersApprove, permissions);
        Assert.Contains(LocationsAll, permissions);
        Assert.Contains(SecurityAuditView, permissions);
        Assert.DoesNotContain(PurchasingPoManage, permissions);
    }

    [Fact]
    public void Purchasing_cannot_approve_purchase_orders()
    {
        var permissions = PermissionsOf("Compras");
        Assert.DoesNotContain(PurchasingPoApprove, permissions);
        Assert.Contains(PurchasingPoManage, permissions);
        Assert.Contains(PurchasingReceive, permissions);
        Assert.Contains(CatalogView, permissions);
        Assert.Contains(InventoryView, permissions);
    }

    [Fact]
    public void Warehouse_has_all_inventory_permissions() =>
        Assert.All([InventoryView, InventoryAdjust, InventoryCount, InventoryConsumption],
            p => Assert.Contains(p, PermissionsOf("Almacén comisariato/fábrica")));

    [Fact]
    public void Branch_manager_matches_spec() =>
        Assert.Equal(
            new[] { InventoryView, InventoryCount, InventoryConsumption, LogisticsView, LogisticsOrdersCreate, LogisticsTransfersReceive }.Order(),
            PermissionsOf("Encargado de sucursal").Order());

    [Fact]
    public void RolePermission_rejects_unknown_codes() =>
        Assert.Throws<ArgumentException>(() => new RolePermission(Guid.NewGuid(), "inventory.delete"));
}
