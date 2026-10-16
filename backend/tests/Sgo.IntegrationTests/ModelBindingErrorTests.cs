using System.Net;
using System.Text;
using System.Text.Json;

namespace Sgo.IntegrationTests;

/// <summary>
/// Requests the frontend never sends (malformed JSON, wrong types, no body) still answer in Spanish, with camelCase
/// keys like the FluentValidation errors and without .NET type names.
/// </summary>
[Collection(ApiCollection.Name)]
public class ModelBindingErrorTests(SgoApiFactory factory)
{
    private const string Location = "00000000-0000-0000-0000-000000000001";

    private async Task<(HttpStatusCode Status, JsonElement Body)> PostAdjustmentAsync(string? json, string contentType = "application/json")
    {
        var client = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);
        var content = new StringContent(json ?? "", Encoding.UTF8, contentType);
        var response = await client.PostAsync("/api/v1/adjustments", content);
        return (response.StatusCode, JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement);
    }

    private static Dictionary<string, string[]> Errors(JsonElement body) =>
        body.GetProperty("errors").Deserialize<Dictionary<string, string[]>>()!;

    [Theory]
    [InlineData("""{ "locationId": "x", """, "locationId")]
    [InlineData("""{ "locationId": "abc", "reason": "Waste", "notes": null, "lines": [] }""", "locationId")]
    [InlineData("""{ "locationId": "00000000-0000-0000-0000-000000000001", "reason": "Nope", "notes": null, "lines": [] }""", "reason")]
    [InlineData("""
        { "locationId": "00000000-0000-0000-0000-000000000001", "reason": "Waste", "notes": null,
          "lines": [ { "itemId": "00000000-0000-0000-0000-000000000002", "lotId": null, "lotNumber": null,
                       "expirationDate": null, "quantity": "diez", "unitCost": null, "notes": null } ] }
        """, "lines[0].quantity")]
    public async Task Bad_json_values_point_to_the_field_in_spanish(string json, string field)
    {
        var (status, body) = await PostAdjustmentAsync(json);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("validation", body.GetProperty("code").GetString());
        var errors = Errors(body);
        Assert.Equal([field], errors.Keys);
        Assert.Equal(["El valor no tiene el formato o el tipo esperado."], errors[field]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("null")]
    public async Task Missing_body_is_reported_once(string? json)
    {
        var (status, body) = await PostAdjustmentAsync(json);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        var errors = Errors(body);
        Assert.Equal(["body"], errors.Keys);
        Assert.Equal(["La solicitud debe incluir un cuerpo JSON."], errors["body"]);
    }

    [Fact]
    public async Task Missing_required_property_uses_the_spanish_required_message()
    {
        var (status, body) = await PostAdjustmentAsync($$"""{ "locationId": "{{Location}}", "reason": "Waste" }""");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal(["Este campo es obligatorio."], Errors(body)["lines"]);
    }

    [Theory]
    [InlineData("page=abc", "page", "El valor 'abc' no es válido.")]
    [InlineData("locationId=abc", "locationId", "El valor 'abc' no es válido.")]
    [InlineData("from=ayer", "from", "El valor 'ayer' no es válido.")]
    public async Task Bad_query_values_are_reported_in_spanish_with_camel_case_keys(string query, string field, string message)
    {
        var client = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

        var response = await client.GetAsync($"/api/v1/adjustments?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal([message], Errors(body)[field]);
    }

    [Fact]
    public async Task Wrong_content_type_explains_that_json_is_expected()
    {
        var (status, body) = await PostAdjustmentAsync("hola", "text/plain");

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, status);
        Assert.Equal("unsupported_media_type", body.GetProperty("code").GetString());
        Assert.Equal("Envía el cuerpo como JSON (Content-Type: application/json).", body.GetProperty("detail").GetString());
    }
}
