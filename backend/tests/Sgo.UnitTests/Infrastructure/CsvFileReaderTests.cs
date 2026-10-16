using System.Text;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Infrastructure.Csv;

namespace Sgo.UnitTests.Infrastructure;

public class CsvFileReaderTests
{
    private static CsvDocument Read(string content, bool bom = false)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        if (bom)
            bytes = [.. Encoding.UTF8.GetPreamble(), .. bytes];
        return new CsvFileReader().Read(new MemoryStream(bytes));
    }

    [Fact]
    public void Reads_comma_separated_with_normalized_headers_and_line_numbers()
    {
        var doc = Read("SKU,Nombre,Categoría\nHAR-001,Harina,Secos\n\nAZU-001,\"Azúcar, estándar\",Secos\n", bom: true);

        Assert.Equal(["sku", "nombre", "categoria"], doc.Headers);
        Assert.Equal(2, doc.Rows.Count);
        Assert.Equal(2, doc.Rows[0].Line);
        Assert.Equal(4, doc.Rows[1].Line);
        Assert.Equal("Azúcar, estándar", doc.Rows[1].Get("nombre"));
    }

    [Fact]
    public void Detects_semicolon_separator_from_spanish_excel()
    {
        var doc = Read("sku;nombre\nHAR-001;Harina\n");
        Assert.Equal("Harina", Assert.Single(doc.Rows).Get("nombre"));
    }

    [Fact]
    public void Empty_file_is_an_import_error()
    {
        var ex = Assert.Throws<ImportValidationException>(() => Read(""));
        Assert.Equal("El archivo está vacío.", Assert.Single(ex.Errors).Message);
    }

    [Fact]
    public void Non_utf8_file_is_rejected_with_a_hint()
    {
        var latin1 = Encoding.Latin1.GetBytes("sku,nombre\nAZU-001,Azúcar\n");
        var ex = Assert.Throws<ImportValidationException>(() => new CsvFileReader().Read(new MemoryStream(latin1)));
        Assert.Contains("UTF-8", Assert.Single(ex.Errors).Message);
    }

    [Theory]
    [InlineData(" Sí ", "si")]
    [InlineData("Materia prima", "materia_prima")]
    [InlineData("vida-útil_días", "vida_util_dias")]
    public void Normalize_removes_accents_case_and_spaces(string input, string expected) =>
        Assert.Equal(expected, CsvText.Normalize(input));
}
