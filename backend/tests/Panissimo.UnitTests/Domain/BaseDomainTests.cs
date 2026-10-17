using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;

namespace Panissimo.UnitTests.Domain;

public class FolioTests
{
    [Theory]
    [InlineData(DocType.PurchaseOrder, 1, "OC-000001")]
    [InlineData(DocType.ProductionClose, 123, "CP-000123")]
    [InlineData(DocType.ProductionOrderImport, 7, "IMP-000007")]
    [InlineData(DocType.CustomerOrder, 1000000, "PC-1000000")]
    public void Formats_prefix_and_six_digits(DocType docType, long number, string expected) =>
        Assert.Equal(expected, Folio.Format(docType, number));

    [Fact]
    public void Every_document_type_has_a_unique_prefix_and_sequence()
    {
        Assert.Equal(Enum.GetValues<DocType>().Length, Folio.Definitions.Count);
        Assert.Equal(Folio.Definitions.Count, Folio.Definitions.Values.Select(d => d.Prefix).Distinct().Count());
        Assert.Equal(Folio.Definitions.Count, Folio.Definitions.Values.Select(d => d.SequenceName).Distinct().Count());
    }

    [Fact]
    public void Rejects_numbers_below_one() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => Folio.Format(DocType.Transfer, 0));
}

public class SystemRolesTests
{
    private static IReadOnlyList<string> PermissionsOf(string key) => SystemRoles.All.Single(r => r.Key == key).Permissions;

    [Fact]
    public void There_are_ten_roles_with_valid_unique_permissions()
    {
        Assert.Equal(10, SystemRoles.All.Count);
        Assert.Equal(10, SystemRoles.All.Select(r => r.Key).Distinct().Count());
        foreach (var role in SystemRoles.All)
        {
            Assert.All(role.Permissions, p => Assert.True(Permissions.IsValid(p), p));
            Assert.Equal(role.Permissions.Count, role.Permissions.Distinct().Count());
        }
    }

    [Fact]
    public void Administrator_has_every_permission() =>
        Assert.Equal(Permissions.Codes.Order(), PermissionsOf(SystemRoles.AdministratorKey).Order());

    [Fact]
    public void Read_only_has_every_view_except_the_audit_log()
    {
        var permissions = PermissionsOf("read_only");
        Assert.DoesNotContain(Permissions.SecurityAuditView, permissions);
        Assert.Contains(Permissions.SalesView, permissions);
        Assert.All(permissions, p => Assert.EndsWith(".view", p));
    }

    [Fact]
    public void Direction_sees_everything_and_approves()
    {
        var permissions = PermissionsOf("direction");
        Assert.Contains(Permissions.SecurityAuditView, permissions);
        Assert.Contains(Permissions.LocationsAll, permissions);
        Assert.Contains(Permissions.PurchasingPoApprove, permissions);
        Assert.DoesNotContain(Permissions.PurchasingPoManage, permissions);
    }

    [Fact]
    public void Purchasing_cannot_approve_its_own_orders() =>
        Assert.DoesNotContain(Permissions.PurchasingPoApprove, PermissionsOf("purchasing"));

    [Fact]
    public void Production_supervisor_only_closes_orders() =>
        Assert.Equal(
            new[] { Permissions.CatalogView, Permissions.InventoryView, Permissions.ProductionOrdersClose, Permissions.ProductionView }.Order(),
            PermissionsOf("production_supervisor").Order());
}

public class SettingsTests
{
    [Fact]
    public void Defaults_are_within_their_limits() =>
        Assert.All(SettingDefinitions.All, d => Assert.Null(d.Validate(d.Default)));

    [Theory]
    [InlineData(AppSettingKeys.OverrunTolerancePct, 100.01)]
    [InlineData(AppSettingKeys.PlanDefaultDays, 0)]
    [InlineData(AppSettingKeys.PlanDefaultDays, 1.5)]
    [InlineData(AppSettingKeys.PoApprovalThreshold, 10.001)]
    public void Out_of_range_or_too_precise_values_are_rejected(string key, double value)
    {
        var setting = new AppSetting(key, SettingDefinitions.Find(key)!.Default);

        var error = Assert.Throws<BusinessRuleException>(() => setting.SetValue((decimal)value));
        Assert.Equal("setting_out_of_range", error.Code);
    }

    [Fact]
    public void Value_round_trips_as_invariant_text()
    {
        var setting = new AppSetting(AppSettingKeys.PoApprovalThreshold, 15000.5m);

        Assert.Equal("15000.5", setting.Value);
        Assert.Equal(15000.5m, setting.DecimalValue);
    }
}

public class OrganizationTests
{
    [Fact]
    public void Only_the_plant_purchases_produces_supplies_and_sells()
    {
        var plant = new Location("planta", "Planta", LocationType.Plant);
        var branch = new Location(" suc-01 ", "Sucursal", LocationType.Branch, "  ");

        Assert.Equal("PLANTA", plant.Code);
        Assert.True(plant is { CanPurchase: true, CanProduce: true, CanSupplyBranches: true, CanSellToCustomers: true });
        Assert.Equal("SUC-01", branch.Code);
        Assert.True(branch is { CanPurchase: false, CanProduce: false, CanSupplyBranches: false, CanSellToCustomers: false });
        Assert.Null(branch.Address);
    }

    [Fact]
    public void Pieces_require_whole_quantities()
    {
        Assert.True(new UnitOfMeasure("PZA", "Pieza", UomKind.Unit).RequiresWholeQuantities);
        Assert.False(new UnitOfMeasure("kg", "Kilogramo", UomKind.Mass).RequiresWholeQuantities);
    }
}
