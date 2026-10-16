using System.Net;
using System.Net.Http.Json;
using Sgo.Application.Common;
using Sgo.Application.Organization;
using Sgo.Domain.Organization;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Organization;

[Collection(ApiCollection.Name)]
public class LocationTests(SgoApiFactory factory)
{
    private const string Locations = "/api/v1/locations";

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    [Fact]
    public async Task Admin_renames_a_branch_and_the_change_is_audited()
    {
        var admin = await AdminAsync();
        var id = await factory.LocationIdAsync("SUC-05");
        var location = (await admin.GetJsonAsync<LocationDto>($"{Locations}/{id}"))!;

        var response = await admin.PutAsJsonAsync($"{Locations}/{id}",
            new UpdateLocationRequest(location.Version, "Sucursal Plaza Norte", "Blvd. Norte 45", true));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.ReadJsonAsync<LocationDto>())!;
        Assert.Equal("Sucursal Plaza Norte", updated.Name);
        Assert.Equal("SUC-05", updated.Code);
        Assert.Equal(LocationType.Branch, updated.Type);

        var audit = (await admin.GetJsonAsync<PagedResult<Sgo.Application.Security.AuditLogDto>>(
            $"/api/v1/audit-log?entityType=Location&entityId={id}"))!;
        Assert.Contains(audit.Items, a => a.Action == "Updated"
                                          && a.Changes.GetProperty("Name").GetProperty("new").GetString() == "Sucursal Plaza Norte");

        var stale = await admin.PutAsJsonAsync($"{Locations}/{id}", new UpdateLocationRequest(location.Version, "Otra", null, true));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Lookup_lists_all_active_locations_for_transfer_destinations()
    {
        // Almacén de comisariato: logistics.view sin locations.view y con acceso solo a COM.
        var warehouse = await factory.CreateUserAsync("Almacén comisariato/fábrica", "COM");
        var client = await factory.CreateAuthenticatedClientAsync(warehouse.Email, warehouse.Password);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Locations)).StatusCode);
        var lookup = (await client.GetJsonAsync<List<LocationLookupDto>>($"{Locations}/lookup"))!;
        Assert.Contains(lookup, l => l.Code == "SUC-01" && l.Type == LocationType.Branch);
        Assert.Contains(lookup, l => l.Code == "COM");
        Assert.Equal(lookup.OrderBy(l => l.Code, StringComparer.Ordinal).Select(l => l.Code), lookup.Select(l => l.Code));

        var branchManager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var branch = await factory.CreateAuthenticatedClientAsync(branchManager.Email, branchManager.Password);
        Assert.Equal(HttpStatusCode.OK, (await branch.GetAsync($"{Locations}/lookup")).StatusCode);
    }

    [Fact]
    public async Task List_shows_only_locations_in_scope()
    {
        var user = await factory.CreateUserAsync("Consulta", "SUC-01", "SUC-02");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var page = (await client.GetJsonAsync<PagedResult<LocationDto>>(Locations))!;

        Assert.Equal(["SUC-01", "SUC-02"], page.Items.Select(l => l.Code));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"{Locations}/{await factory.LocationIdAsync("FAB")}")).StatusCode);
    }

    [Fact]
    public async Task Editing_requires_locations_manage()
    {
        var user = await factory.CreateUserAsync("Consulta", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);
        var id = await factory.LocationIdAsync("SUC-01");
        var location = (await client.GetJsonAsync<LocationDto>($"{Locations}/{id}"))!;

        var response = await client.PutAsJsonAsync($"{Locations}/{id}", new UpdateLocationRequest(location.Version, "Hackeada", null, true));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Inactive_locations_are_hidden_unless_requested()
    {
        var admin = await AdminAsync();
        var id = await factory.LocationIdAsync("SUC-06");
        var location = (await admin.GetJsonAsync<LocationDto>($"{Locations}/{id}"))!;
        var deactivated = (await (await admin.PutAsJsonAsync($"{Locations}/{id}",
            new UpdateLocationRequest(location.Version, location.Name, location.Address, false))).ReadJsonAsync<LocationDto>())!;

        var active = (await admin.GetJsonAsync<PagedResult<LocationDto>>($"{Locations}?pageSize=100"))!;
        var all = (await admin.GetJsonAsync<PagedResult<LocationDto>>($"{Locations}?includeInactive=true&pageSize=100"))!;

        Assert.DoesNotContain(active.Items, l => l.Id == id);
        Assert.Contains(all.Items, l => l.Id == id && !l.IsActive);

        await admin.PutAsJsonAsync($"{Locations}/{id}", new UpdateLocationRequest(deactivated.Version, location.Name, location.Address, true));
    }
}
