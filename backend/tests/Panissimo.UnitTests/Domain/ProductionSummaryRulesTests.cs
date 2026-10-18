using Panissimo.Application.Production;

namespace Panissimo.UnitTests.Domain;

public class ProductionSummaryRulesTests
{
    [Theory]
    [InlineData(100, 95, 95)]
    [InlineData(300, 100, 33.33)]
    [InlineData(80, 100, 125)]      // over-production is above 100 %
    [InlineData(100, 0, 0)]
    public void Compliance_is_produced_over_planned(decimal planned, decimal produced, decimal expected) =>
        Assert.Equal(expected, ProductionSummaryRules.CompliancePct(planned, produced));

    [Fact]
    public void Without_planned_there_is_no_compliance() =>
        Assert.Null(ProductionSummaryRules.CompliancePct(0, 50));
}
