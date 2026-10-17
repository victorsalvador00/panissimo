using System.Globalization;
using System.Text;

namespace Panissimo.Application.Common;

/// <param name="Line">Spreadsheet line number (the header is line 1).</param>
public sealed record CsvRow(int Line, IReadOnlyDictionary<string, string> Values)
{
    public string Get(string column) => Values.TryGetValue(column, out var value) ? value.Trim() : "";
}

/// <param name="Headers">Normalized: lowercase, trimmed, without accents.</param>
public sealed record CsvDocument(IReadOnlyList<string> Headers, IReadOnlyList<CsvRow> Rows);

public interface ICsvReader
{
    /// <summary>Reads UTF-8 CSV (RFC 4180), auto-detecting "," or ";". Throws <see cref="Domain.Common.ImportValidationException"/> if unreadable.</summary>
    CsvDocument Read(Stream stream);
}

public static class CsvText
{
    /// <summary>"Sí " → "si", "Materia prima" → "materia_prima", "Bizcocho Día" → "bizcocho_dia".</summary>
    public static string Normalize(string value)
    {
        var decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark)
                continue;
            builder.Append(c is ' ' or '-' ? '_' : c);
        }
        return builder.ToString().Normalize(NormalizationForm.FormC);
    }

    /// <summary>Invariant decimal (point as separator); null when not a number.</summary>
    public static decimal? ParseDecimal(string text) =>
        decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) ? value : null;
}
