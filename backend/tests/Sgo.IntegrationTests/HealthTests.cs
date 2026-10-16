using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;

namespace Sgo.IntegrationTests;

[Collection(ApiCollection.Name)]
public class HealthTests(SgoApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Live_returns_200()
    {
        var response = await _client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Ready_returns_200_when_database_is_reachable()
    {
        var response = await _client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_route_without_session_returns_401_to_avoid_route_discovery()
    {
        var response = await _client.GetAsync("/api/v1/does-not-exist");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_route_returns_problem_details()
    {
        var client = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

        var response = await client.GetAsync("/api/v1/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal(404, problem!.Status);
        Assert.Equal("https://sgo/errors/not_found", problem.Type);
        Assert.Equal("No encontrado", problem.Title);
        Assert.True(problem.Extensions.ContainsKey("traceId"));
    }
}
