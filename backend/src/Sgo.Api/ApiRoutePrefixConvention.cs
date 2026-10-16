using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationModels;

namespace Sgo.Api;

/// <summary>Prefixes every controller route with /api/v1.</summary>
public sealed class ApiRoutePrefixConvention : IApplicationModelConvention
{
    public const string Prefix = "api/v1";

    private readonly AttributeRouteModel _prefix = new(new RouteAttribute(Prefix));

    public void Apply(ApplicationModel application)
    {
        foreach (var selector in application.Controllers.SelectMany(c => c.Selectors))
        {
            selector.AttributeRouteModel = selector.AttributeRouteModel is null
                ? _prefix
                : AttributeRouteModel.CombineAttributeRouteModel(_prefix, selector.AttributeRouteModel);
        }
    }
}
