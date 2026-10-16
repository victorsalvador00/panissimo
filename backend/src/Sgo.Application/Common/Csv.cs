using System.Globalization;
using System.Text;

namespace Sgo.Application.Common;

/// <param name="Line">Spreadsheet line number (the header is line 1).</param>
public sealed record CsvRow(int Line, IReadOnlyDictionary<string, string> Values)
{
    public string Get(string column) => Values.TryGetValue(column, out var value) ? value.Trim() : "";
}

/// <param name="Headers">Normalized: lowercase, trimmed, without accents.</param>
public sealed record CsvDocument(IReadOnlyList<string> Headers, IReadOnlyList<CsvRow> Rows);

public interface ICsvReader
{
    /// <summary>Reads UTF-8 CSV, auto-detecting "," or ";". Throws <see cref="Domain.Common.ImportValidationException"/> if unreadable.</summary>
    CsvDocument Read(Stream stream);
}

public static class CsvText
{
    /// <summary>"Sí " → "si", "Materia prima" → "materia_prima".</summary>
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
}
