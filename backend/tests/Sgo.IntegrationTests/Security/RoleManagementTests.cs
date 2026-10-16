using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence.Seed;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class RoleManagementTests(SgoApiFactory factory)
{
    private const string Roles = "/api/v1/roles";

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static string UniqueName(string prefix) => $"{prefix} {Guid.NewGuid().ToString("N")[..8]}";

    private async Task<RoleDto> AdministratorRoleAsync(HttpClient admin)
    {
        var page = (await admin.GetFromJsonAsync<PagedResult<RoleListItemDto>>($"{Roles}?pageSize=100"))!;
        var id = page.Items.Single(r => r.Name == SystemRoles.Administrator).Id;
        return (await admin.GetFromJsonAsync<RoleDto>($"{Roles}/{id}"))!;
    }

    [Fact]
    public async Task Permissions_catalog_is_grouped_by_module()
    {
        var admin = await AdminAsync();

        var groups = (await admin.GetFromJsonAsync<List<PermissionGroupDto>>("/api/v1/permissions"))!;

        Assert.Equal(Permissions.Codes.Count, groups.Sum(g => g.Permissions.Count));
        Assert.Contains(groups, g => g.Module == "Compras" && g.Permissions.Any(p => p.Code == Permissions.PurchasingPoApprove));
    }

    [Fact]
    public async Task Editing_a_role_changes_permissions_of_its_users_on_the_next_request()
    {
        var admin = await AdminAsync();
        var created = await admin.PostAsJsonAsync(Roles, new CreateRoleRequest(UniqueName("Supervisor"), "Prueba", [Permissions.InventoryView]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var role = (await created.Content.ReadFromJsonAsync<RoleDto>())!;
        Assert.False(role.IsSystem);

        var request = new CreateUserRequest($"rol-{Guid.NewGuid():N}@sgo.test", "Usuario Rol", "Temporal2024x",
            [role.Id], [await factory.LocationIdAsync("SUC-01")], null);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/v1/users", request)).StatusCode);
        var client = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/test-probe/adjust")).StatusCode);

        var updated = await admin.PutAsJsonAsync($"{Roles}/{role.Id}",
            new UpdateRoleRequest(role.Version, role.Name, "Con ajustes", [Permissions.InventoryView, Permissions.InventoryAdjust]));

        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/test-probe/adjust")).StatusCode);

        var stale = await admin.PutAsJsonAsync($"{Roles}/{role.Id}",
            new UpdateRoleRequest(role.Version, role.Name, "Otra", [Permissions.InventoryView]));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Role_validation_errors()
    {
        var admin = await AdminAsync();

        var unknownPermission = await admin.PostAsJsonAsync(Roles, new CreateRoleRequest(UniqueName("Rol"), "", ["inventory.delete"]));
        Assert.Equal(HttpStatusCode.BadRequest, unknownPermission.StatusCode);

        var duplicate = await admin.PostAsJsonAsync(Roles, new CreateRoleRequest("consulta", "", [Permissions.InventoryView]));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains("ya existe", (await duplicate.ProblemAsync()).GetProperty("errors").GetProperty("name")[0].GetString());
    }

    [Fact]
    public async Task Administrator_role_always_keeps_every_permission()
    {
        var admin = await AdminAsync();
        var role = await AdministratorRoleAsync(admin);
        Assert.True(role.IsAdministrator);

        var response = await admin.PutAsJsonAsync($"{Roles}/{role.Id}",
            new UpdateRoleRequest(role.Version, role.Name, role.Description, role.Permissions.Where(p => p != Permissions.SettingsManage).ToList()));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("admin_role_locked", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Renaming_a_system_role_does_not_duplicate_it_on_the_next_seed()
    {
        var admin = await AdminAsync();
        var role = await AdministratorRoleAsync(admin);

        var renamed = await admin.PutAsJsonAsync($"{Roles}/{role.Id}",
            new UpdateRoleRequest(role.Version, "Administración general", role.Description, role.Permissions));
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var renamedDto = (await renamed.Content.ReadFromJsonAsync<RoleDto>())!;

        await using (var scope = factory.CreateScope())
        {
            var before = await SgoApiFactory.Db(scope).Roles.CountAsync();
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
            Assert.Equal(before, await SgoApiFactory.Db(scope).Roles.CountAsync());
        }

        // Restore the name for the other tests.
        var restored = await admin.PutAsJsonAsync($"{Roles}/{role.Id}",
            new UpdateRoleRequest(renamedDto.Version, SystemRoles.Administrator, role.Description, role.Permissions));
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
    }

    [Fact]
    public async Task Role_manager_cannot_grant_permissions_they_do_not_hold()
    {
        var admin = await AdminAsync();
        var limited = (await (await admin.PostAsJsonAsync(Roles, new CreateRoleRequest(UniqueName("Gestor roles"), "Prueba",
            [Permissions.SecurityRolesManage, Permissions.InventoryView]))).Content.ReadFromJsonAsync<RoleDto>())!;
        var request = new CreateUserRequest($"roles-{Guid.NewGuid():N}@sgo.test", "Gestor", "Temporal2024x",
            [limited.Id], [await factory.LocationIdAsync("SUC-01")], null);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/v1/users", request)).StatusCode);
        var manager = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);

        var escalate = await manager.PostAsJsonAsync(Roles, new CreateRoleRequest(UniqueName("Escalado"), "", [Permissions.SettingsManage]));
        Assert.Equal(HttpStatusCode.Forbidden, escalate.StatusCode);

        var lockout = await manager.PutAsJsonAsync($"{Roles}/{limited.Id}",
            new UpdateRoleRequest(limited.Version, limited.Name, "", [Permissions.InventoryView]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, lockout.StatusCode);
        Assert.Equal("cannot_lock_yourself_out", await lockout.ProblemCodeAsync());

        var allowed = await manager.PostAsJsonAsync(Roles, new CreateRoleRequest(UniqueName("Solo consulta"), "", [Permissions.InventoryView]));
        Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
    }
}
