namespace Sgo.Domain.Common;

/// <summary>Base class for expected errors whose message can be shown to the user (Spanish).</summary>
public abstract class DomainException(string message) : Exception(message);

/// <summary>Invalid state transition or broken business rule. Maps to 422.</summary>
public sealed class BusinessRuleException(string code, string message) : DomainException(message)
{
    public string Code { get; } = code;
}

/// <summary>Maps to 404.</summary>
public sealed class NotFoundException(string entityName, object key)
    : DomainException($"No se encontró {entityName} con identificador '{key}'.")
{
    public string EntityName { get; } = entityName;
    public object Key { get; } = key;
}

/// <summary>The supplied version does not match the stored one. Maps to 409.</summary>
public sealed class ConcurrencyException()
    : DomainException("El registro fue modificado por otro usuario. Recarga e intenta de nuevo.");

/// <summary>Login, refresh or session failure. Maps to 401.</summary>
public sealed class AuthenticationFailedException(string code, string message) : DomainException(message)
{
    public string Code { get; } = code;
}

/// <summary>Input errors detected outside FluentValidation (e.g. password policy). Maps to 400.</summary>
public sealed class RequestValidationException(IReadOnlyDictionary<string, string[]> errors)
    : DomainException("La solicitud contiene datos inválidos.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}

/// <summary>An error in an imported file. <paramref name="Row"/> is the spreadsheet line (header = 1).</summary>
public sealed record ImportError(int Row, string? Column, string Message);

/// <summary>An import file failed validation; nothing was saved. Maps to 400.</summary>
public sealed class ImportValidationException(IReadOnlyList<ImportError> errors)
    : DomainException($"El archivo tiene {errors.Count} error(es). No se importó nada.")
{
    public IReadOnlyList<ImportError> Errors { get; } = errors;
}

/// <summary>User lacks permission or location scope. Maps to 403.</summary>
public sealed class ForbiddenException(string message = "No tienes permiso para realizar esta acción.")
    : DomainException(message);

public sealed record StockShortage(
    Guid ItemId, string Sku, string Name, Guid? LotId, decimal Requested, decimal Available);

/// <summary>RN-02: resulting stock would be negative. Maps to 409.</summary>
public sealed class InsufficientStockException(IReadOnlyList<StockShortage> shortages)
    : DomainException("Existencia insuficiente para completar la operación.")
{
    public IReadOnlyList<StockShortage> Shortages { get; } = shortages;
}
