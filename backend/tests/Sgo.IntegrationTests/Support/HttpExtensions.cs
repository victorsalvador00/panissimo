using System.Net.Http.Json;
using System.Text.Json;
using Sgo.Api.Auth;

namespace Sgo.IntegrationTests.Support;

public static class HttpExtensions
{
    /// <summary>Same JSON contract as the API (camelCase, enums as strings).</summary>
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public static Task<T?> GetJsonAsync<T>(this HttpClient client, string url) => client.GetFromJsonAsync<T>(url, Json);

    public static Task<T?> ReadJsonAsync<T>(this HttpResponseMessage response) => response.Content.ReadFromJsonAsync<T>(Json);

    /// <summary>The refresh token set by the response, or null.</summary>
    public static string? RefreshCookieValue(this HttpResponseMessage response) =>
        response.RefreshCookieHeader()?.Split(';')[0][(RefreshTokenCookie.Name.Length + 1)..] is { Length: > 0 } value ? value : null;

    public static string? RefreshCookieHeader(this HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(v => v.StartsWith(RefreshTokenCookie.Name + "=", StringComparison.Ordinal))
            : null;

    public static Task<HttpResponseMessage> PostWithRefreshCookieAsync(this HttpClient client, string url, string? refreshToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url);
        if (refreshToken is not null)
            request.Headers.Add("Cookie", $"{RefreshTokenCookie.Name}={refreshToken}");
        return client.SendAsync(request);
    }

    /// <summary>ProblemDetails as raw JSON, to read extensions such as <c>code</c> or <c>errors</c>.</summary>
    public static async Task<JsonElement> ProblemAsync(this HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<string> ProblemCodeAsync(this HttpResponseMessage response) =>
        (await response.ProblemAsync()).GetProperty("code").GetString()!;
}
