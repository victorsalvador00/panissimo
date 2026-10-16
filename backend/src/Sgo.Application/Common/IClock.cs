namespace Sgo.Application.Common;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public static class BusinessCalendar
{
    /// <summary>Dates are stored in UTC; the business date is computed in Mexico City (dominio §3).</summary>
    public static readonly TimeZoneInfo TimeZone = TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City");

    public static DateOnly ToBusinessDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZone).DateTime);

    public static DateOnly BusinessDate(this IClock clock) => ToBusinessDate(clock.UtcNow);
}
