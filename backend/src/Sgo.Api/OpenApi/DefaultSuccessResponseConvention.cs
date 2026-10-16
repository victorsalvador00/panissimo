using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Sgo.Api.OpenApi;

/// <summary>
/// Documents <c>200 OK</c> with the action's real return type (e.g. <c>PagedResult&lt;ItemDto&gt;</c>) when the
/// action declares no success response. ApiExplorer only infers it when an action has no response metadata at
/// all, and every controller declares 401/403 at class level, so without this the OpenAPI document (and the
/// frontend's generated types) would lack the response body of most endpoints.
/// </summary>
public sealed class DefaultSuccessResponseConvention : IActionModelConvention
{
    public void Apply(ActionModel action)
    {
        if (DeclaresSuccessResponse(action))
        {
            return;
        }

        var bodyType = ResponseBodyType(action.ActionMethod.ReturnType);
        if (bodyType is not null)
        {
            action.Filters.Add(new ProducesResponseTypeAttribute(bodyType, StatusCodes.Status200OK));
        }
    }

    private static bool DeclaresSuccessResponse(ActionModel action) =>
        action.Attributes
            .Concat(action.Controller.Attributes)
            .OfType<IApiResponseMetadataProvider>()
            .Any(metadata => metadata.StatusCode is >= 200 and < 300);

    /// <summary>Unwraps Task/ValueTask and ActionResult&lt;T&gt;; null for void or untyped results.</summary>
    internal static Type? ResponseBodyType(Type returnType)
    {
        var type = UnwrapGeneric(returnType, typeof(Task<>)) ?? UnwrapGeneric(returnType, typeof(ValueTask<>));
        if (type is null)
        {
            if (returnType == typeof(Task) || returnType == typeof(ValueTask))
            {
                return null;
            }
            type = returnType;
        }

        type = UnwrapGeneric(type, typeof(ActionResult<>)) ?? type;

        return type == typeof(void) || typeof(IActionResult).IsAssignableFrom(type) ? null : type;
    }

    private static Type? UnwrapGeneric(Type type, Type definition) =>
        type.IsGenericType && type.GetGenericTypeDefinition() == definition ? type.GetGenericArguments()[0] : null;
}
