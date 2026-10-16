using System.Net;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Sgo.IntegrationTests;

[Collection(ApiCollection.Name)]
public class JsonOptionsTests(SgoApiFactory factory)
{
    [Fact]
    public void Mvc_and_http_json_options_match_so_openapi_documents_the_wire_format()
    {
        var mvc = factory.Services.GetRequiredService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>().Value;
        var http = factory.Services.GetRequiredService<IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions>>().Value;

        Assert.Equal(JsonNumberHandling.Strict, mvc.JsonSerializerOptions.NumberHandling);
        Assert.Equal(JsonNumberHandling.Strict, http.SerializerOptions.NumberHandling);
        Assert.Contains(mvc.JsonSerializerOptions.Converters, c => c is JsonStringEnumConverter);
        Assert.Contains(http.SerializerOptions.Converters, c => c is JsonStringEnumConverter);
    }

    [Fact]
    public async Task Number_sent_as_string_is_rejected_with_400()
    {
        var client = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);
        const string body = """
            { "locationId": "00000000-0000-0000-0000-000000000001", "reason": "Other", "notes": null,
              "lines": [ { "itemId": "00000000-0000-0000-0000-000000000002", "lotId": null, "lotNumber": null,
                           "expirationDate": null, "quantity": "5", "unitCost": null, "notes": null } ] }
            """;

        var response = await client.PostAsync("/api/v1/adjustments", new StringContent(body, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
