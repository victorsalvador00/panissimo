using ClosedXML.Excel;
using Panissimo.Domain.Common;
using Panissimo.Infrastructure.Excel;

namespace Panissimo.UnitTests.Api;

public class ClosedXmlOrderReaderTests
{
    private readonly ClosedXmlOrderReader _reader = new();

    private static MemoryStream Workbook(Action<XLWorkbook> build)
    {
        using var workbook = new XLWorkbook();
        build(workbook);
        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    [Fact]
    public void Prefers_the_op_sheet_and_normalizes_headers_with_accents_and_case()
    {
        var file = Workbook(w =>
        {
            w.Worksheets.Add("Matriz").Cell(1, 1).Value = "otra";
            var sheet = w.Worksheets.Add("op");
            sheet.Cell(1, 1).Value = " Fecha ";
            sheet.Cell(1, 2).Value = "SKU";
            sheet.Cell(1, 3).Value = "Ubicación";
            sheet.Cell(2, 1).Value = new DateTime(2026, 10, 17);
            sheet.Cell(2, 2).Value = "bomba";
            sheet.Cell(2, 3).Value = "PLANTA";
        });

        var result = _reader.Read(file);

        Assert.Equal(["fecha", "sku", "ubicacion"], result.Headers);
        var row = Assert.Single(result.Rows);
        Assert.Equal((2, new DateOnly(2026, 10, 17), "bomba"), (row.Row, row.Get("fecha")!.Date!.Value, row.Get("sku")!.Text));
    }

    [Fact]
    public void Reads_numbers_text_dates_and_cached_formula_values_and_skips_empty_rows()
    {
        var file = Workbook(w =>
        {
            var sheet = w.Worksheets.Add("OP");
            sheet.Cell(1, 1).Value = "fecha";
            sheet.Cell(1, 2).Value = "cantidad";
            sheet.Cell(2, 1).Value = "17/10/2026";
            sheet.Cell(2, 2).Value = 3200;
            sheet.Cell(4, 1).Value = "18/10/2026";
            sheet.Cell(4, 2).FormulaA1 = "B2/2";
            w.RecalculateAllFormulas(); // Excel stores the cached value; a workbook built in memory needs it computed
        });

        var rows = _reader.Read(file).Rows;

        Assert.Equal([2, 4], rows.Select(r => r.Row));
        Assert.Equal(("17/10/2026", null, 3200m), (rows[0].Get("fecha")!.Text, rows[0].Get("fecha")!.Date, rows[0].Get("cantidad")!.Number!.Value));
        Assert.Equal(1600m, rows[1].Get("cantidad")!.Number);
    }

    [Fact]
    public void Unreadable_files_are_an_import_error()
    {
        var error = Assert.Throws<ImportValidationException>(() => _reader.Read(new MemoryStream("no es excel"u8.ToArray())));
        Assert.Contains(".xlsx", error.Errors.Single().Message);
    }

    [Fact]
    public void Template_has_the_op_and_instructions_sheets_with_the_expected_headers()
    {
        using var workbook = new XLWorkbook(new MemoryStream(_reader.CreateTemplate()));

        Assert.Equal(["OP", "Instrucciones"], workbook.Worksheets.Select(w => w.Name));
        Assert.Equal(["fecha", "sku", "cantidad", "turno", "ubicacion", "notas"],
            Enumerable.Range(1, 6).Select(c => workbook.Worksheet("OP").Cell(1, c).GetString()));
        Assert.Single(workbook.Worksheet("OP").DataValidations);
    }
}
