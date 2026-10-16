using Sgo.Domain.Common;

namespace Sgo.Domain.Inventory;

public enum ConsumptionStatus
{
    Posted,
    Cancelled,
}

public sealed record ConsumptionLineInput(Guid ItemId, Guid? LotId, decimal Quantity);

/// <summary>
/// Branch consumption (dominio §4.3, decisión abierta 1: daily capture + physical count).
/// Created and posted in one step as Consumption exits.
/// </summary>
[Audited]
public class ConsumptionEntry : AuditableEntity, IVersioned
{
    public const string DocType = "Consumption";

    private readonly List<ConsumptionLine> _lines = [];

    private ConsumptionEntry() { }

    public ConsumptionEntry(string folio, Guid locationId, DateOnly businessDate, DateOnly today, string? notes, IReadOnlyList<ConsumptionLineInput> lines)
    {
        if (businessDate > today)
            throw new BusinessRuleException("consumption_future_date", "La fecha del consumo no puede ser futura.");
        if (lines.Count == 0)
            throw new BusinessRuleException("consumption_without_lines", "El consumo debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades consumidas deben ser mayores que cero.");

        Folio = folio;
        LocationId = locationId;
        BusinessDate = businessDate;
        Status = ConsumptionStatus.Posted;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.AddRange(lines.Select(l => new ConsumptionLine(Id, l)));
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }

    /// <summary>Day the consumption happened (captured); may be earlier than the posting date.</summary>
    public DateOnly BusinessDate { get; private set; }

    public ConsumptionStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<ConsumptionLine> Lines => _lines;

    public IEnumerable<MovementRequest> ToMovementRequests() =>
        _lines.Select(l => new MovementRequest(LocationId, l.ItemId, l.LotId, MovementType.Consumption, -l.Quantity, null,
            DocType, Id, Folio, $"Consumo del {BusinessDate:dd/MM/yyyy}"));
}

public class ConsumptionLine : Entity
{
    private ConsumptionLine() { }

    internal ConsumptionLine(Guid entryId, ConsumptionLineInput input)
    {
        EntryId = entryId;
        ItemId = input.ItemId;
        LotId = input.LotId;
        Quantity = input.Quantity;
    }

    public Guid EntryId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>Null = FEFO (RN-05).</summary>
    public Guid? LotId { get; private set; }

    /// <summary>Positive, base unit.</summary>
    public decimal Quantity { get; private set; }
}
