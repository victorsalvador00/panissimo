using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Metadata;
using Sgo.Api.Middleware;

namespace Sgo.Api.Validation;

/// <summary>
/// Model binding errors (malformed JSON, a value of the wrong type, a missing body) in the same shape and language as
/// the FluentValidation ones: camelCase keys without the "$." JSON path prefix and Spanish messages without .NET type names.
/// </summary>
public static partial class ModelStateProblem
{
    public const string InvalidValue = "El valor no tiene el formato o el tipo esperado.";
    public const string Required = "Este campo es obligatorio.";
    public const string MissingBody = "La solicitud debe incluir un cuerpo JSON.";

    public static IActionResult Response(ActionContext context)
    {
        var bodyParameters = context.ActionDescriptor.Parameters
            .Where(p => p.BindingInfo?.BindingSource == BindingSource.Body)
            .Select(p => p.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var errors = new Dictionary<string, string[]>();
        foreach (var (key, entry) in context.ModelState)
        {
            if (entry.Errors.Count == 0)
                continue;
            var messages = entry.Errors.Select(Translate).Distinct().ToArray();
            errors[NormalizeKey(key, bodyParameters)] = messages;
        }

        // "The request field is required." for the body parameter only repeats the real error (bad JSON, empty body).
        if (errors.Count > 1)
            foreach (var name in bodyParameters)
                errors.Remove(ValidationKeys.ToCamelCase(name));

        var problem = new ValidationProblemDetails(errors)
        {
            Status = StatusCodes.Status400BadRequest,
            Detail = "La solicitud contiene datos inválidos.",
        };
        ProblemDetailsMapper.Normalize(problem);
        problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        return new ObjectResult(problem) { StatusCode = StatusCodes.Status400BadRequest };
    }

    /// <summary>Spanish texts for the messages MVC builds itself (query string, route and body binding).</summary>
    public static void UseSpanishMessages(DefaultModelBindingMessageProvider messages)
    {
        messages.SetAttemptedValueIsInvalidAccessor((value, _) => $"El valor '{value}' no es válido.");
        messages.SetNonPropertyAttemptedValueIsInvalidAccessor(value => $"El valor '{value}' no es válido.");
        messages.SetValueIsInvalidAccessor(value => $"El valor '{value}' no es válido.");
        messages.SetUnknownValueIsInvalidAccessor(_ => InvalidValue);
        messages.SetNonPropertyUnknownValueIsInvalidAccessor(() => InvalidValue);
        messages.SetValueMustBeANumberAccessor(_ => "Debe ser un número.");
        messages.SetNonPropertyValueMustBeANumberAccessor(() => "Debe ser un número.");
        messages.SetValueMustNotBeNullAccessor(_ => "Este valor no puede ser nulo.");
        messages.SetMissingBindRequiredValueAccessor(_ => Required);
        messages.SetMissingKeyOrValueAccessor(() => Required);
        messages.SetMissingRequestBodyRequiredValueAccessor(() => MissingBody);
    }

    private static string Translate(ModelError error)
    {
        // With AllowInputFormatterExceptionMessages off, a JSON error comes with the exception and no message.
        if (string.IsNullOrEmpty(error.ErrorMessage) || error.ErrorMessage.StartsWith("The JSON value", StringComparison.Ordinal))
            return InvalidValue;
        // [Required] implied by non-nullable reference properties uses the DataAnnotations English text.
        if (RequiredMessage().IsMatch(error.ErrorMessage))
            return Required;
        return error.ErrorMessage;
    }

    private static string NormalizeKey(string key, HashSet<string> bodyParameters)
    {
        if (key.Length == 0)
            return "body";
        var path = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key == "$" ? "body" : key;
        // "request.Lines[0].Quantity" (body parameter prefix) → "lines[0].quantity".
        var dot = path.IndexOf('.');
        if (dot > 0 && bodyParameters.Contains(path[..dot]))
            path = path[(dot + 1)..];
        return ValidationKeys.ToCamelCase(path);
    }

    [GeneratedRegex(@"^The .+ field is required\.$")]
    private static partial Regex RequiredMessage();
}

public static class ValidationKeys
{
    /// <summary>"Lines[0].Quantity" → "lines[0].quantity".</summary>
    public static string ToCamelCase(string name) =>
        string.Join('.', name.Split('.').Select(part => part.Length == 0 ? part : char.ToLowerInvariant(part[0]) + part[1..]));
}
