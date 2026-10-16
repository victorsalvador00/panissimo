using System.Globalization;
using System.Text;
using CsvHelper;
using CsvHelper.Configuration;
using Sgo.Application.Common;
using Sgo.Domain.Common;

namespace Sgo.Infrastructure.Csv;

public sealed class CsvFileReader : ICsvReader
{
    public CsvDocument Read(Stream stream)
    {
        var configuration = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            DetectDelimiter = true,
            DetectDelimiterValues = [",", ";"],
            IgnoreBlankLines = true,
            TrimOptions = TrimOptions.Trim,
            BadDataFound = null,
            MissingFieldFound = null,
        };

        try
        {
            using var text = new StreamReader(stream, new UTF8Encoding(false, throwOnInvalidBytes: true), detectEncodingFromByteOrderMarks: true);
            using var csv = new CsvReader(text, configuration);

            if (!csv.Read() || !csv.ReadHeader() || csv.HeaderRecord is null)
                throw new ImportValidationException([new ImportError(1, null, "El archivo está vacío.")]);

            var headers = csv.HeaderRecord.Select(CsvText.Normalize).ToList();
            var rows = new List<CsvRow>();
            while (csv.Read())
            {
                var values = new Dictionary<string, string>();
                for (var i = 0; i < headers.Count; i++)
                    values.TryAdd(headers[i], csv.TryGetField<string>(i, out var value) ? value ?? "" : "");

                if (values.Values.All(string.IsNullOrWhiteSpace))
                    continue;
                rows.Add(new CsvRow(csv.Parser.RawRow, values));
            }

            return new CsvDocument(headers, rows);
        }
        catch (DecoderFallbackException)
        {
            throw new ImportValidationException([new ImportError(1, null, "El archivo debe estar en UTF-8. En Excel: Guardar como → CSV UTF-8.")]);
        }
        catch (CsvHelperException ex)
        {
            throw new ImportValidationException([new ImportError(ex.Context?.Parser?.RawRow ?? 1, null, "No se pudo leer el archivo CSV. Revisa el formato.")]);
        }
    }
}
