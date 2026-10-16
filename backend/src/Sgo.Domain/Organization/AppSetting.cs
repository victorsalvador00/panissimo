using Sgo.Domain.Common;

namespace Sgo.Domain.Organization;

/// <summary>Key/value system parameter (dominio §4.7).</summary>
[Audited]
public class AppSetting : IVersioned
{
    private AppSetting() { }

    public AppSetting(string key, string value, string description)
    {
        Key = key;
        Value = value;
        Description = description;
    }

    public string Key { get; private set; } = null!;
    public string Value { get; private set; } = null!;
    public string Description { get; private set; } = null!;
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
    public uint Version { get; private set; }

    public void SetValue(string value) => Value = value;
}

public static class AppSettingKeys
{
    /// <summary>RN-31: PO total (MXN, before tax) at or above which approval is required.</summary>
    public const string PoApprovalThreshold = "purchasing.po_approval_threshold";

    /// <summary>RN-32: allowed over-receipt percentage.</summary>
    public const string ReceiptTolerancePct = "purchasing.receipt_tolerance_pct";

    /// <summary>RN-07: days ahead to warn about expiring lots.</summary>
    public const string ExpirationAlertDays = "inventory.expiration_alert_days";

    public static readonly IReadOnlyList<AppSetting> Defaults =
    [
        // Decision pending (dominio §7.3): 0 means every PO requires approval until configured.
        new(PoApprovalThreshold, "0", "Monto (MXN sin IVA) a partir del cual una OC requiere aprobación"),
        new(ReceiptTolerancePct, "0", "Porcentaje permitido de sobre-recepción en compras"),
        new(ExpirationAlertDays, "3", "Días de anticipación para la alerta de lotes por caducar"),
    ];
}

public enum SettingKind
{
    Decimal,
    Integer,
}

/// <summary>Type and limits of an editable setting, shared by validation and the settings screen.</summary>
public sealed record SettingDefinition(string Key, string Label, SettingKind Kind, decimal Min, decimal Max, int Decimals)
{
    /// <summary>Spanish message when <paramref name="value"/> is not acceptable; null when it is.</summary>
    public string? Validate(decimal value)
    {
        if (value < Min || value > Max)
            return $"{Label}: el valor debe estar entre {Min:0.##} y {Max:0.##}.";
        if (decimal.Round(value, Decimals) != value)
            return Kind == SettingKind.Integer ? $"{Label}: debe ser un número entero." : $"{Label}: admite máximo {Decimals} decimales.";
        return null;
    }
}

public static class SettingDefinitions
{
    public static readonly IReadOnlyList<SettingDefinition> All =
    [
        new(AppSettingKeys.PoApprovalThreshold, "Umbral de aprobación de OC", SettingKind.Decimal, 0, 99_999_999, 2),
        new(AppSettingKeys.ReceiptTolerancePct, "Tolerancia de recepción (%)", SettingKind.Decimal, 0, 100, 2),
        new(AppSettingKeys.ExpirationAlertDays, "Días de alerta de caducidad", SettingKind.Integer, 0, 365, 0),
    ];

    public static SettingDefinition? Find(string key) => All.FirstOrDefault(d => d.Key == key);
}
