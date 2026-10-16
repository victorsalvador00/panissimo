using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;
using Sgo.Application.Common;
using Sgo.Application.Catalog;

namespace Sgo.IntegrationTests;

/// <summary>The frontend generates its types from OpenAPI: every endpoint that returns a body must document it.</summary>
[Collection(ApiCollection.Name)]
public class OpenApiResponseTests(SgoApiFactory factory)
{
    private IEnumerable<ApiDescription> ApiEndpoints() =>
        factory.Services.GetRequiredService<IApiDescriptionGroupCollectionProvider>()
            .ApiDescriptionGroups.Items
            .SelectMany(group => group.Items)
            .Where(d => d.ActionDescriptor is ControllerActionDescriptor c
                        && c.ControllerTypeInfo.Assembly == typeof(Program).Assembly);

    [Fact]
    public void Every_get_endpoint_documents_a_typed_success_response()
    {
        var missing = ApiEndpoints()
            .Where(d => d.HttpMethod == "GET")
            .Where(d => !d.SupportedResponseTypes.Any(r => r.StatusCode is >= 200 and < 300 && r.Type is not null && r.Type != typeof(void)))
            .Select(d => $"GET /{d.RelativePath}")
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public void Paged_list_documents_its_real_type()
    {
        var items = ApiEndpoints().Single(d => d.HttpMethod == "GET" && d.RelativePath == "api/v1/items");

        var ok = Assert.Single(items.SupportedResponseTypes, r => r.StatusCode == 200);
        Assert.Equal(typeof(PagedResult<ItemListItemDto>), ok.Type);
    }

    [Fact]
    public void Declared_created_response_is_not_duplicated_with_200()
    {
        var create = ApiEndpoints().Single(d => d.HttpMethod == "POST" && d.RelativePath == "api/v1/items");

        Assert.Contains(create.SupportedResponseTypes, r => r.StatusCode == 201);
        Assert.DoesNotContain(create.SupportedResponseTypes, r => r.StatusCode == 200);
    }
}
