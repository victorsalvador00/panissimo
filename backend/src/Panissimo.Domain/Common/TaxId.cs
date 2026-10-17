using System.Globalization;
using System.Text.RegularExpressions;

namespace Panissimo.Domain.Common;

/// <summary>Mexican RFC (RN-35): shared by suppliers and, later, customers.</summary>
public static partial class TaxIdRules
{
    public const string GenericNational = "XAXX010101000";
    public const string GenericForeign = "XEXX010101000";
    public static readonly IReadOnlyList<string> Generics = [GenericNational, GenericForeign];

    public const string InvalidMessage =
        "El RFC no es válido: 12 caracteres para persona moral o 13 para persona física, con fecha AAMMDD válida.";

    // 3 letters (moral) or 4 (física), YYMMDD, 3-character homoclave.
    [GeneratedRegex("^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$")]
    private static partial Regex Pattern();

    public static string Normalize(string taxId) => taxId.Trim().ToUpperInvariant();

    /// <summary>Generic RFCs may repeat; any other one is unique.</summary>
    public static bool IsGeneric(string normalized) => Generics.Contains(normalized);

    /// <summary>Format check on a normalized RFC; the homoclave check digit is not verified.</summary>
    public static bool IsValid(string normalized)
    {
        if (!Pattern().IsMatch(normalized))
            return false;
        var date = normalized.Substring(normalized.Length - 9, 6);
        // YY is ambiguous (19YY or 20YY); a 20YY reading accepts every Feb 29 a 19YY reading would, plus 2000.
        return DateOnly.TryParseExact("20" + date, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }
}
