using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Api;

[Collection(ApiCollection.Name)]
public class HostTests(ApiFactory factory)
{
    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task Health_checks_respond_200(string path)
    {
        var response = await factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_route_returns_spanish_problem_details()
    {
        var client = await factory.LoginAsAdminAsync();
        var response = await client.GetAsync("/api/v1/no-existe");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal("https://panissimo/errors/not_found", problem!.Type);
        Assert.Equal("No encontrado", problem.Title);
        Assert.True(problem.Extensions.ContainsKey("traceId"));
    }

    [Fact]
    public async Task OpenApi_document_is_published_in_development()
    {
        var response = await factory.CreateClient().GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("SGO Paníssimo API", await response.Content.ReadAsStringAsync());
    }
}
