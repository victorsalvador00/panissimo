using ClosedXML.Excel;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Common;

namespace Panissimo.Infrastructure.Excel;

/// <summary>Production order sheet with ClosedXML (backend §7). Reads cached formula values; never evaluates formulas.</summary>
public sealed class ClosedXmlOrderReader : IExcelOrderReader
{
    public const string SheetName = "OP";

    public ExcelSheet Read(Stream xlsx)
    {
        XLWorkbook workbook;
        try
        {
            workbook = new XLWorkbook(xlsx);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            throw new ImportValidationException([new ImportError(1, null, "No se pudo leer el archivo. Debe ser un libro de Excel (.xlsx).")]);
        }

        using (workbook)
        {
            var sheet = workbook.Worksheets.FirstOrDefault(w => w.Name.Equals(SheetName, StringComparison.OrdinalIgnoreCase))
                        ?? workbook.Worksheets.FirstOrDefault()
                        ?? throw new ImportValidationException([new ImportError(1, null, "El libro no tiene hojas.")]);

            var used = sheet.RangeUsed();
            if (used is null)
                return new ExcelSheet([], []);

            var lastColumn = used.LastColumn().ColumnNumber();
            var headers = Enumerable.Range(1, lastColumn)
                .Select(c => (Column: c, Name: CsvText.Normalize(sheet.Cell(1, c).GetString())))
                .Where(h => h.Name.Length > 0)
                .ToList();

            var rows = new List<ExcelRow>();
            for (var r = 2; r <= used.LastRow().RowNumber(); r++)
            {
                var cells = new Dictionary<string, ExcelCell>();
                foreach (var (column, name) in headers)
                    cells.TryAdd(name, ToCell(sheet.Cell(r, column)));
                if (cells.Values.All(c => c.Text.Length == 0))
                    continue;
                rows.Add(new ExcelRow(r, cells));
            }
            return new ExcelSheet(headers.Select(h => h.Name).ToList(), rows);
        }
    }

    private static ExcelCell ToCell(IXLCell cell)
    {
        var value = cell.HasFormula ? FormulaValue(cell) : cell.Value;
        if (value.IsDateTime)
        {
            var date = value.GetDateTime();
            return new ExcelCell(date.ToString("dd/MM/yyyy"), DateOnly.FromDateTime(date), null);
        }
        if (value.IsNumber)
        {
            var number = (decimal)value.GetNumber();
            return new ExcelCell(number.ToString(System.Globalization.CultureInfo.InvariantCulture), null, number);
        }
        return new ExcelCell(value.IsBlank ? "" : value.ToString().Trim(), null, null);
    }

    /// <summary>
    /// The value Excel cached when the file was saved. Files written by other tools may lack it: then the formula is
    /// evaluated, and an error leaves the cell empty (reported by the validation as a missing value).
    /// </summary>
    private static XLCellValue FormulaValue(IXLCell cell)
    {
        if (!cell.CachedValue.IsBlank)
            return cell.CachedValue;
        try
        {
            return cell.Value;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return Blank.Value;
        }
    }

    public byte[] CreateTemplate()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(SheetName);
        string[] headers = ["fecha", "sku", "cantidad", "turno", "ubicacion", "notas"];
        for (var i = 0; i < headers.Length; i++)
            sheet.Cell(1, i + 1).Value = headers[i];
        var header = sheet.Range(1, 1, 1, headers.Length);
        header.Style.Font.Bold = true;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8EAF6");
        sheet.Column(1).Style.DateFormat.Format = "dd/mm/yyyy";
        sheet.Range("D2:D3001").CreateDataValidation().List("\"Día,Tarde,Noche\"", true);
        sheet.SheetView.FreezeRows(1);
        sheet.Columns(1, headers.Length).Width = 16;
        sheet.Column(6).Width = 40;

        var help = workbook.Worksheets.Add("Instrucciones");
        string[][] lines =
        [
            ["Columna", "Obligatoria", "Qué capturar"],
            ["fecha", "Sí", "Fecha programada (celda de fecha o texto dd/mm/aaaa). No puede ser pasada."],
            ["sku", "Sí", "SKU del artículo: semiterminado o producto terminado activo con receta activa."],
            ["cantidad", "Sí", "Mayor que cero, hasta 4 decimales; entera si el producto se maneja en piezas."],
            ["turno", "No", "Día, Tarde o Noche. Vacío = sin turno."],
            ["ubicacion", "No", "Código de la Planta. Vacío = la Planta."],
            ["notas", "No", "Máximo 500 caracteres."],
            ["", "", ""],
            ["Reglas", "", "Las filas con la misma fecha, SKU, turno y ubicación se suman en una sola orden. Máximo 3,000 filas. " +
                "Si hay un solo error no se crea nada; corrige y vuelve a subir el archivo."],
        ];
        for (var r = 0; r < lines.Length; r++)
            for (var c = 0; c < lines[r].Length; c++)
                help.Cell(r + 1, c + 1).Value = lines[r][c];
        help.Row(1).Style.Font.Bold = true;
        help.Column(1).Width = 14;
        help.Column(2).Width = 12;
        help.Column(3).Width = 100;

        using var output = new MemoryStream();
        workbook.SaveAs(output);
        return output.ToArray();
    }
}
