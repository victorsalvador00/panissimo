namespace Panissimo.Application.Common;

public sealed class DatabaseOptions
{
    public const string Section = "Database";

    /// <summary>Apply pending migrations at startup. Development only; production uses the migration bundle.</summary>
    public bool MigrateOnStartup { get; set; }

    /// <summary>Run the idempotent seed at startup (Development); production uses <c>--seed</c>.</summary>
    public bool SeedOnStartup { get; set; }
}
