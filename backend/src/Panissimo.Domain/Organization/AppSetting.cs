using System.Globalization;
using Panissimo.Domain.Common;

namespace Panissimo.Domain.Organization;

/// <summary>Typed system parameter (dominio §4.8). The value is stored as invariant text.</summary>
[Audited]
public class AppSetting : IVersioned
{
    private AppSetting() { }

    public AppSetting(string key, decimal value)
    {
        Key = key;
        SetValue(value);
    }

    public string Key { get; private set; } = null!;
    public string Value { get; private set; } = null!;
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
    public uint Version { get; private set; }

    public decimal DecimalValue => decimal.Parse(Value, CultureInfo.InvariantCulture);

    /// <summary>Validates against the definition of the key.</summary>
    public void SetValue(decimal value)
    {
        var definition = SettingDefinitions.Find(Key)
            ?? throw new ArgumentException($"Unknown setting '{Key}'.");
        if (definition.Validate(value) is { } error)
            throw new BusinessRuleException("setting_out_of_range", error);
        Value = value.ToString(CultureInfo.InvariantCulture);
    }
}

public static class AppSettingKeys
{
    public const string PoApprovalThreshold = "purchasing.po_approval_threshold";
    public const string ReceiptTolerancePct = "purchasing.receipt_tolerance_pct";
    public const string ExpiryAlertDays = "inventory.expiry_alert_days";
    public const string MinCoverDays = "inventory.min_cover_days";
    public const string MaxCoverDays = "inventory.max_cover_days";
    public const string CostIncreaseAlertPct = "production.cost_increase_alert_pct";
    public const string OverrunTolerancePct = "production.overrun_tolerance_pct";
    public const string PlanDefaultDays = "production.plan_default_days";
    public const string ShipmentTolerancePct = "sales.shipment_tolerance_pct";
}

public enum SettingKind
{
    Decimal,
    Integer,
}

/// <summary>Type, limits and default of a setting, shared by the seed, validation and the settings screen.</summary>
public sealed record SettingDefinition(
    string Key, string Label, SettingKind Kind, decimal Min, decimal Max, int Decimals, decimal Default)
{
    /// <summary>Spanish message when <paramref name="value"/> is not acceptable; null when it is.</summary>
    public string? Validate(decimal value)
    {
        if (value < Min || value > Max)
            return $"{Label}: el valor debe estar entre {Min.ToString("#,0.##", CultureInfo.InvariantCulture)} y {Max.ToString("#,0.##", CultureInfo.InvariantCulture)}.";
        if (decimal.Round(value, Decimals) != value)
            return Kind == SettingKind.Integer ? $"{Label}: debe ser un número entero." : $"{Label}: admite máximo {Decimals} decimales.";
        return null;
    }
}

public static class SettingDefinitions
{
    public static readonly IReadOnlyList<SettingDefinition> All =
    [
        new(AppSettingKeys.PoApprovalThreshold, "Umbral de aprobación de OC (MXN sin IVA)", SettingKind.Decimal, 0, 99_999_999, 2, 0),
        new(AppSettingKeys.ReceiptTolerancePct, "Tolerancia de recepción de compras (%)", SettingKind.Decimal, 0, 100, 2, 0),
        new(AppSettingKeys.ExpiryAlertDays, "Días de alerta de caducidad", SettingKind.Integer, 0, 365, 0, 3),
        new(AppSettingKeys.MinCoverDays, "Cobertura del mínimo sugerido (días)", SettingKind.Integer, 0, 60, 0, 2),
        new(AppSettingKeys.MaxCoverDays, "Cobertura del máximo sugerido (días)", SettingKind.Integer, 0, 60, 0, 7),
        new(AppSettingKeys.CostIncreaseAlertPct, "Alza de costo de insumo para aviso (%)", SettingKind.Decimal, 0, 100, 2, 5),
        new(AppSettingKeys.OverrunTolerancePct, "Tolerancia de sobreproducción (%)", SettingKind.Decimal, 0, 100, 2, 10),
        new(AppSettingKeys.PlanDefaultDays, "Días del plan de producción por omisión", SettingKind.Integer, 1, 14, 0, 1),
        new(AppSettingKeys.ShipmentTolerancePct, "Tolerancia de remisión sobre lo pedido (%)", SettingKind.Decimal, 0, 100, 2, 0),
    ];

    public static SettingDefinition? Find(string key) => All.FirstOrDefault(d => d.Key == key);
}
