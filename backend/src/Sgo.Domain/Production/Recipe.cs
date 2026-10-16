using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Production;

/// <param name="Quantity">Per recipe yield, in the component's base unit.</param>
/// <param name="WastePct">Expected waste, 0–100.</param>
public sealed record RecipeLineInput(Guid ComponentItemId, decimal Quantity, decimal WastePct);

public sealed record TheoreticalConsumption(Guid ComponentItemId, decimal Quantity);

/// <summary>
/// Versioned bill of materials (dominio §4.4). RN-10: one active recipe per item; editing a recipe already used
/// by a production order creates version N+1 and keeps the old one for those orders.
/// The recipe's version number is <see cref="VersionNumber"/>; <see cref="Version"/> is the concurrency token.
/// </summary>
[Audited]
public class Recipe : AuditableEntity, IVersioned
{
    private readonly List<RecipeLine> _lines = [];

    private Recipe() { }

    public Recipe(Guid outputItemId, int versionNumber, decimal yieldQty, string? notes, IReadOnlyList<RecipeLineInput> lines)
    {
        OutputItemId = outputItemId;
        VersionNumber = versionNumber;
        IsActive = true;
        Apply(yieldQty, notes, lines);
    }

    public Guid OutputItemId { get; private set; }
    public int VersionNumber { get; private set; }
    public bool IsActive { get; private set; }

    /// <summary>Output quantity produced by the lines, in the product's base unit.</summary>
    public decimal YieldQty { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>Set when a production order uses this version; from then on edits create a new version.</summary>
    public bool IsUsed { get; private set; }

    public uint Version { get; private set; }
    public IReadOnlyList<RecipeLine> Lines => _lines;

    /// <summary>
    /// RN-10: an unused recipe is edited in place (returns null). A used one is deactivated and the edit becomes
    /// version N+1, returned so the caller can save it.
    /// </summary>
    public Recipe? Revise(decimal yieldQty, string? notes, IReadOnlyList<RecipeLineInput> lines)
    {
        if (!IsActive)
            throw new BusinessRuleException("recipe_not_active", "Solo la versión activa de la receta puede editarse.");

        if (!IsUsed)
        {
            Apply(yieldQty, notes, lines);
            return null;
        }

        var next = new Recipe(OutputItemId, VersionNumber + 1, yieldQty, notes, lines);
        IsActive = false;
        return next;
    }

    public void MarkUsed() => IsUsed = true;

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;

    public bool HasSameContent(decimal yieldQty, IReadOnlyList<RecipeLineInput> lines) =>
        YieldQty == yieldQty
        && _lines.Count == lines.Count
        && _lines.All(l => lines.Any(i => i.ComponentItemId == l.ComponentItemId && i.Quantity == l.Quantity && i.WastePct == l.WastePct));

    /// <summary>RN-11: theoretical consumption per line = qty / YieldQty × line.Quantity × (1 + WastePct/100).</summary>
    public IReadOnlyList<TheoreticalConsumption> Explode(decimal quantity)
    {
        if (quantity <= 0)
            throw new BusinessRuleException("invalid_quantity", "La cantidad a producir debe ser mayor que cero.");
        return _lines.Select(l => new TheoreticalConsumption(l.ComponentItemId,
                InventoryMath.Round(quantity / YieldQty * l.Quantity * (1 + l.WastePct / 100m))))
            .ToList();
    }

    private void Apply(decimal yieldQty, string? notes, IReadOnlyList<RecipeLineInput> lines)
    {
        if (yieldQty <= 0 || InventoryMath.Round(yieldQty) != yieldQty)
            throw new BusinessRuleException("recipe_invalid_yield", "El rendimiento debe ser mayor que cero, con máximo 4 decimales.");
        if (lines.Count == 0)
            throw new BusinessRuleException("recipe_without_lines", "La receta debe tener al menos un componente.");
        if (lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades de los componentes deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.Any(l => l.WastePct is < 0 or > 100 || decimal.Round(l.WastePct, 2) != l.WastePct))
            throw new BusinessRuleException("recipe_invalid_waste", "La merma debe estar entre 0 y 100 %, con máximo 2 decimales.");
        if (lines.Select(l => l.ComponentItemId).Distinct().Count() != lines.Count)
            throw new BusinessRuleException("recipe_duplicated_component", "Hay componentes repetidos en la receta.");
        if (lines.Any(l => l.ComponentItemId == OutputItemId))
            throw new BusinessRuleException("recipe_self_component", "Un artículo no puede ser componente de su propia receta.");

        YieldQty = yieldQty;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select(l => new RecipeLine(Id, l)));
    }
}

public class RecipeLine : Entity
{
    private RecipeLine() { }

    internal RecipeLine(Guid recipeId, RecipeLineInput input)
    {
        RecipeId = recipeId;
        ComponentItemId = input.ComponentItemId;
        Quantity = input.Quantity;
        WastePct = input.WastePct;
    }

    public Guid RecipeId { get; private set; }
    public Guid ComponentItemId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal WastePct { get; private set; }
}

/// <summary>Detects cycles among active recipes (A uses B and B uses A, directly or through others).</summary>
public static class RecipeGraph
{
    /// <param name="activeRecipes">Output item → components of its active recipe (excluding the one being saved).</param>
    public static bool CreatesCycle(Guid outputItemId, IEnumerable<Guid> components, IReadOnlyDictionary<Guid, IReadOnlyList<Guid>> activeRecipes)
    {
        var visited = new HashSet<Guid>();
        var pending = new Stack<Guid>(components);
        while (pending.Count > 0)
        {
            var item = pending.Pop();
            if (item == outputItemId)
                return true;
            if (!visited.Add(item) || !activeRecipes.TryGetValue(item, out var children))
                continue;
            foreach (var child in children)
                pending.Push(child);
        }
        return false;
    }
}
