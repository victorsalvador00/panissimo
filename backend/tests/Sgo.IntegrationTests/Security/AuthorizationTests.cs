using System.Net;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class AuthorizationTests(SgoApiFactory factory)
{
    private const string Probe = "/api/v1/test-probe";

    [Fact]
    public async Task Missing_permission_returns_403_problem_details()
    {
        var user = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var response = await client.GetAsync($"{Probe}/adjust");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("forbidden", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Granted_permission_returns_200()
    {
        var user = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{Probe}/view")).StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_without_token_returns_401()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateApiClient().GetAsync($"{Probe}/view")).StatusCode);
    }

    [Fact]
    public async Task Location_not_assigned_returns_403()
    {
        var user = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var response = await client.GetAsync($"{Probe}/locations/{await factory.LocationIdAsync("SUC-02")}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var problem = await response.ProblemAsync();
        Assert.Equal("forbidden", problem.GetProperty("code").GetString());
        Assert.Equal("No tienes acceso a esta ubicación.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Assigned_location_returns_200()
    {
        var user = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var response = await client.GetAsync($"{Probe}/locations/{await factory.LocationIdAsync("SUC-01")}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Locations_all_permission_grants_every_location()
    {
        var user = await factory.CreateUserAsync("Gerente de operaciones");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        foreach (var code in new[] { "SUC-07", "FAB", "COM" })
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{Probe}/locations/{await factory.LocationIdAsync(code)}")).StatusCode);
    }
}
