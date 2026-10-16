using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sgo.Domain.Common;

namespace Sgo.Api.Middleware;

/// <summary>Maps exceptions to RFC 9457 ProblemDetails following spec table 6.1.</summary>
public static class ProblemDetailsMapper
{
    public const string TypeBase = "https://sgo/errors/";

    public static ProblemDetails Map(Exception exception) => exception switch
    {
        BusinessRuleException e => Create(StatusCodes.Status422UnprocessableEntity, e.Code, "Regla de negocio incumplida", e.Message),
        InsufficientStockException e => WithShortages(
            Create(StatusCodes.Status409Conflict, "insufficient_stock", "Existencia insuficiente", e.Message), e.Shortages),
        ConcurrencyException e => Create(StatusCodes.Status409Conflict, "concurrency", "Conflicto de concurrencia", e.Message),
        DbUpdateConcurrencyException => Create(StatusCodes.Status409Conflict, "concurrency", "Conflicto de concurrencia",
            new ConcurrencyException().Message),
        NotFoundException e => Create(StatusCodes.Status404NotFound, "not_found", "No encontrado", e.Message),
        AuthenticationFailedException e => Create(StatusCodes.Status401Unauthorized, e.Code, "No autenticado", e.Message),
        ImportValidationException e => WithRowErrors(
            Create(StatusCodes.Status400BadRequest, "import_invalid", "Archivo con errores", e.Message), e.Errors),
        RequestValidationException e => WithErrors(
            Create(StatusCodes.Status400BadRequest, "validation", "Solicitud inválida", e.Message), e.Errors),
        ForbiddenException e => Create(StatusCodes.Status403Forbidden, "forbidden", "Acceso denegado", e.Message),
        // Two writers that passed the "already exists?" check at the same time; the database index stopped the second.
        DbUpdateException e when IsUniqueViolation(e) => Create(StatusCodes.Status409Conflict, "duplicate", "Registro duplicado",
            "Otro usuario registró la misma información al mismo tiempo. Vuelve a intentarlo."),
        _ => Create(StatusCodes.Status500InternalServerError, "internal", "Error interno",
            "Ocurrió un error inesperado. Si persiste, contacta al administrador."),
    };

    /// <summary>
    /// Gives framework-generated problems (routing 404, 401/403 from auth, model binding 400)
    /// the SGO AR type, code and a Spanish title. Problems created by <see cref="Map"/> are left as is.
    /// </summary>
    public static void Normalize(ProblemDetails problem)
    {
        if (problem.Type?.StartsWith(TypeBase, StringComparison.Ordinal) == true)
            return;

        (string Code, string Title, string Detail)? known = problem.Status switch
        {
            StatusCodes.Status400BadRequest => ("validation", "Solicitud inválida", "La solicitud contiene datos inválidos."),
            StatusCodes.Status401Unauthorized => ("unauthorized", "No autenticado", "Inicia sesión para continuar."),
            StatusCodes.Status403Forbidden => ("forbidden", "Acceso denegado", "No tienes permiso para realizar esta acción."),
            StatusCodes.Status404NotFound => ("not_found", "No encontrado", "El recurso solicitado no existe."),
            StatusCodes.Status405MethodNotAllowed => ("method_not_allowed", "Método no permitido", "La operación no está permitida en este recurso."),
            StatusCodes.Status415UnsupportedMediaType => ("unsupported_media_type", "Tipo de contenido no admitido",
                "Envía el cuerpo como JSON (Content-Type: application/json)."),
            StatusCodes.Status429TooManyRequests => ("too_many_requests", "Demasiadas solicitudes", "Demasiadas solicitudes. Intenta más tarde."),
            _ => null,
        };
        if (known is null)
            return;

        problem.Type = TypeBase + known.Value.Code;
        problem.Title = known.Value.Title;
        problem.Detail ??= known.Value.Detail;
        problem.Extensions["code"] = known.Value.Code;
    }

    public static bool IsUniqueViolation(Exception exception) =>
        exception is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } };

    private static ProblemDetails Create(int status, string code, string title, string detail)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Type = TypeBase + code,
            Title = title,
            Detail = detail,
        };
        problem.Extensions["code"] = code;
        return problem;
    }

    private static ProblemDetails WithErrors(ProblemDetails problem, IReadOnlyDictionary<string, string[]> errors)
    {
        problem.Extensions["errors"] = errors;
        return problem;
    }

    private static ProblemDetails WithRowErrors(ProblemDetails problem, IReadOnlyList<ImportError> errors)
    {
        problem.Extensions["rowErrors"] = errors;
        return problem;
    }

    private static ProblemDetails WithShortages(ProblemDetails problem, IReadOnlyList<StockShortage> shortages)
    {
        problem.Extensions["shortages"] = shortages;
        return problem;
    }
}
