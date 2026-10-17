using Panissimo.Domain.Common;

namespace Panissimo.Domain.Production;

/// <summary>A batch of production orders created from one Excel file (dominio §4.4, RN-94).</summary>
[Audited]
public class ProductionOrderImport : AuditableEntity
{
    public const string DocType = "ProductionOrderImport";

    private ProductionOrderImport() { }

    public ProductionOrderImport(string folio, string fileName, string fileSha256, int rowCount, int orderCount, bool releasedOnImport)
    {
        Folio = folio;
        FileName = fileName;
        FileSha256 = fileSha256;
        RowCount = rowCount;
        OrderCount = orderCount;
        ReleasedOnImport = releasedOnImport;
    }

    public string Folio { get; private set; } = null!;
    public string FileName { get; private set; } = null!;

    /// <summary>RN-93: a file with the same hash as a previous import is a warning.</summary>
    public string FileSha256 { get; private set; } = null!;

    public int RowCount { get; private set; }
    public int OrderCount { get; private set; }
    public bool ReleasedOnImport { get; private set; }
}
