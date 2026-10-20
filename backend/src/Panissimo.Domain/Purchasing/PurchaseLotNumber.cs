using System.Globalization;

namespace Panissimo.Domain.Purchasing;

/// <summary>
/// RN-117: the lot of a goods receipt is generated as <c>{SKU without separators}-{DDMMYY}-{NN}</c>, NN being the number of
/// that item's receipt on that day (01, 02…). Example: MP-001 received on 20/10/2026 → <c>MP001-201026-01</c>.
/// </summary>
public static class PurchaseLotNumber
{
    /// <summary>Lots are up to 50 characters: the SKU part is cut so the date and a sequence up to 999 fit.</summary>
    public const int MaxSkuLength = 50 - 11;

    /// <summary>Everything before the sequence, with its trailing dash: <c>MP001-201026-</c>.</summary>
    public static string Prefix(string sku, DateOnly receivedOn)
    {
        var compact = new string(sku.Where(char.IsAsciiLetterOrDigit).ToArray()).ToUpperInvariant();
        if (compact.Length > MaxSkuLength)
            compact = compact[..MaxSkuLength];
        return $"{compact}-{receivedOn.ToString("ddMMyy", CultureInfo.InvariantCulture)}-";
    }

    public static string Format(string prefix, int sequence) => $"{prefix}{sequence:D2}";

    /// <summary>The sequence of a lot number with that prefix, or null if it is not one (a lot captured by hand, say).</summary>
    public static int? SequenceOf(string lotNumber, string prefix)
    {
        if (!lotNumber.StartsWith(prefix, StringComparison.Ordinal))
            return null;
        var rest = lotNumber[prefix.Length..];
        return rest.Length > 0 && rest.All(char.IsAsciiDigit) && int.TryParse(rest, CultureInfo.InvariantCulture, out var n) ? n : null;
    }

    /// <summary>The next lot after the ones the item already has: the highest sequence plus one, 01 if there is none.</summary>
    public static string Next(string prefix, IEnumerable<string> existingLotNumbers) =>
        Format(prefix, existingLotNumbers.Select(l => SequenceOf(l, prefix) ?? 0).DefaultIfEmpty(0).Max() + 1);
}
