using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sgo.Domain.Organization;

namespace Sgo.Application.Common;

public static class AppSettingsExtensions
{
    /// <summary>Reads a numeric setting (invariant culture); falls back to the default in <see cref="AppSettingKeys.Defaults"/>.</summary>
    public static async Task<decimal> GetDecimalSettingAsync(this ISgoDbContext db, string key, CancellationToken ct)
    {
        var value = await db.AppSettings.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).SingleOrDefaultAsync(ct)
                    ?? AppSettingKeys.Defaults.Single(s => s.Key == key).Value;
        return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)
            ? number
            : throw new InvalidOperationException($"The setting '{key}' is not a number: '{value}'.");
    }
}
