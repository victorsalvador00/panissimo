using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Panissimo.IntegrationTests.Infrastructure;

/// <summary>Same wire format as the API: camelCase and enums as text.</summary>
public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static Task<T?> GetJsonAsync<T>(this HttpClient client, string url) =>
        client.GetFromJsonAsync<T>(url, Options);

    public static Task<T?> ReadJsonAsync<T>(this HttpContent content) =>
        content.ReadFromJsonAsync<T>(Options);

    public static Task<HttpResponseMessage> PostJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PostAsJsonAsync(url, body, Options);

    public static Task<HttpResponseMessage> PutJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PutAsJsonAsync(url, body, Options);
}
