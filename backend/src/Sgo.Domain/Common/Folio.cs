namespace Sgo.Domain.Common;

/// <summary>Sequential document numbers, e.g. <c>OC-000001</c> (dominio §3).</summary>
public static class Folio
{
    public sealed record Definition(string Prefix, string Schema, string SequenceName);

    public static readonly IReadOnlyDictionary<DocType, Definition> Definitions = new Dictionary<DocType, Definition>
    {
        [DocType.Requisition] = new("REQ", "purchasing", "requisition_folio_seq"),
        [DocType.PurchaseOrder] = new("OC", "purchasing", "purchase_order_folio_seq"),
        [DocType.GoodsReceipt] = new("REC", "purchasing", "goods_receipt_folio_seq"),
        [DocType.ProductionOrder] = new("OP", "production", "production_order_folio_seq"),
        [DocType.BranchOrder] = new("PED", "logistics", "branch_order_folio_seq"),
        [DocType.Transfer] = new("TR", "logistics", "transfer_folio_seq"),
        [DocType.Adjustment] = new("AJ", "inventory", "adjustment_folio_seq"),
        [DocType.PhysicalCount] = new("CF", "inventory", "physical_count_folio_seq"),
        [DocType.Consumption] = new("CON", "inventory", "consumption_folio_seq"),
    };

    public static string Format(DocType docType, long number)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(number, 1);
        return $"{Definitions[docType].Prefix}-{number:D6}";
    }
}
