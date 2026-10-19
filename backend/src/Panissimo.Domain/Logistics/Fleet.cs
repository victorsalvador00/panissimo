using System.Text.RegularExpressions;
using Panissimo.Domain.Common;

namespace Panissimo.Domain.Logistics;

/// <summary>RN-113: a vehicle of the fleet; dispatches of transfers and shipments choose an active one.</summary>
[Audited]
public partial class Vehicle : AuditableEntity, IVersioned
{
    public const int PlateMaxLength = 15;
    public const int DescriptionMaxLength = 120;

    private Vehicle() { }

    public Vehicle(string plate, string description)
    {
        Plate = NormalizePlate(plate);
        if (Plate.Length is 0 or > PlateMaxLength || !PlatePattern().IsMatch(Plate))
            throw new BusinessRuleException("vehicle_invalid_plate",
                $"Las placas admiten letras, números y guion, hasta {PlateMaxLength} caracteres (ej. ABC-123-D).");
        Update(description);
        IsActive = true;
    }

    /// <summary>Unique, stored in upper case without spaces.</summary>
    public string Plate { get; private set; } = null!;

    public string Description { get; private set; } = null!;
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    /// <summary>What a dispatch keeps as its text copy (history and print).</summary>
    public string Label => $"{Description} · {Plate}";

    public static string NormalizePlate(string plate) => plate.Trim().Replace(" ", "").ToUpperInvariant();

    public void Update(string description)
    {
        var text = description.Trim();
        if (text.Length is 0 or > DescriptionMaxLength)
            throw new BusinessRuleException("vehicle_invalid_description", $"La descripción es obligatoria, hasta {DescriptionMaxLength} caracteres.");
        Description = text;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;

    [GeneratedRegex("^[A-Z0-9][A-Z0-9-]*$")]
    private static partial Regex PlatePattern();
}

/// <summary>RN-113: a driver of the fleet; dispatches choose an active one.</summary>
[Audited]
public class Driver : AuditableEntity, IVersioned
{
    public const int NameMaxLength = 120;
    public const int PhoneMaxLength = 20;

    private Driver() { }

    public Driver(string name, string? phone)
    {
        Update(name, phone);
        IsActive = true;
    }

    public string Name { get; private set; } = null!;
    public string? Phone { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(string name, string? phone)
    {
        var text = name.Trim();
        if (text.Length is 0 or > NameMaxLength)
            throw new BusinessRuleException("driver_invalid_name", $"El nombre es obligatorio, hasta {NameMaxLength} caracteres.");
        var digits = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        if (digits is { Length: > PhoneMaxLength })
            throw new BusinessRuleException("driver_invalid_phone", $"El teléfono admite hasta {PhoneMaxLength} caracteres.");
        Name = text;
        Phone = digits;
    }

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}

public static class FleetRules
{
    /// <summary>RN-113: a dispatch takes an active vehicle and an active driver of the catalog.</summary>
    public static void EnsureCanDispatch(Vehicle? vehicle, Driver? driver)
    {
        if (vehicle is not { IsActive: true })
            throw new BusinessRuleException("vehicle_not_available", "Elige un vehículo activo del catálogo.");
        if (driver is not { IsActive: true })
            throw new BusinessRuleException("driver_not_available", "Elige un chofer activo del catálogo.");
    }
}
