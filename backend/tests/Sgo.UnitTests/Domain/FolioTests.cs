using Sgo.Domain.Common;

namespace Sgo.UnitTests.Domain;

public class FolioTests
{
    [Theory]
    [InlineData(DocType.PurchaseOrder, 1, "OC-000001")]
    [InlineData(DocType.Requisition, 42, "REQ-000042")]
    [InlineData(DocType.Transfer, 123456, "TR-123456")]
    [InlineData(DocType.Consumption, 1234567, "CON-1234567")]
    public void Format_uses_prefix_and_six_digits(DocType docType, long number, string expected) =>
        Assert.Equal(expected, Folio.Format(docType, number));

    [Fact]
    public void Every_document_type_has_a_definition() =>
        Assert.All(Enum.GetValues<DocType>(), d => Assert.True(Folio.Definitions.ContainsKey(d)));

    [Fact]
    public void Prefixes_match_domain_spec()
    {
        var expected = new Dictionary<DocType, string>
        {
            [DocType.Requisition] = "REQ", [DocType.PurchaseOrder] = "OC", [DocType.GoodsReceipt] = "REC",
            [DocType.ProductionOrder] = "OP", [DocType.BranchOrder] = "PED", [DocType.Transfer] = "TR",
            [DocType.Adjustment] = "AJ", [DocType.PhysicalCount] = "CF", [DocType.Consumption] = "CON",
        };
        Assert.All(expected, kv => Assert.Equal(kv.Value, Folio.Definitions[kv.Key].Prefix));
    }

    [Fact]
    public void Format_rejects_non_positive_numbers() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => Folio.Format(DocType.PurchaseOrder, 0));
}
