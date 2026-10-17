using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Organization;
using Panissimo.Application.Security;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;
using Guard = Panissimo.Infrastructure.Identity.PrivilegeGuard;

namespace Panissimo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class AdministrationTests(ApiFactory factory)
{
    private async Task<(Guid Plant, Guid Suc01, Guid Suc02)> LocationIdsAsync()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var ids = await db.Locations.ToDictionaryAsync(l => l.Code, l => l.Id);
        return (ids["PLANTA"], ids["SUC-01"], ids["SUC-02"]);
    }

    private async Task<Guid> RoleIdAsync(string systemKey)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Roles.Where(r => r.SystemKey == systemKey).Select(r => r.Id).SingleAsync();
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response) =>
        (await response.Content.ReadJsonAsync<ProblemDetails>())!.Extensions["code"]?.ToString();

    [Fact]
    public async Task Admin_creates_a_user_who_only_sees_what_was_granted()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, suc01, _) = await LocationIdsAsync();
        var email = ApiFactory.UniqueEmail("encargado");

        var create = await admin.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            email, "Encargada Centro", ApiFactory.DefaultPassword, [await RoleIdAsync("branch_manager")], [suc01], null));

        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var user = await create.Content.ReadJsonAsync<UserDto>();
        Assert.Equal(suc01, user!.DefaultLocationId);
        Assert.Equal("Administrador", user.CreatedByName);

        var client = await factory.LoginAsync(email);
        var me = await client.GetJsonAsync<MeDto>("/api/v1/me");
        Assert.False(me!.AllLocations);
        Assert.Equal(["SUC-01"], me.Locations.Select(l => l.Code));
        Assert.DoesNotContain(Permissions.LocationsView, me.Permissions);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/locations")).StatusCode);
    }

    [Fact]
    public async Task Location_list_is_limited_to_the_scope_and_lookup_shows_every_active_location()
    {
        var email = ApiFactory.UniqueEmail("consulta");
        await factory.CreateUserAsync(email, ["read_only"], ["SUC-02"]);
        var client = await factory.LoginAsync(email);

        var list = await client.GetJsonAsync<PagedResult<LocationDto>>("/api/v1/locations");
        Assert.Equal(["SUC-02"], list!.Items.Select(l => l.Code));

        var lookup = await client.GetJsonAsync<List<LocationLookupDto>>("/api/v1/locations/lookup");
        Assert.Equal("PLANTA", lookup![0].Code);
        Assert.Contains(lookup, l => l.Code == "SUC-01");
    }

    [Fact]
    public async Task Locations_are_created_and_edited_with_version_checks()
    {
        var admin = await factory.LoginAsAdminAsync();
        var code = $"SUC-{Random.Shared.Next(100, 999)}";

        var created = await admin.PostJsonAsync("/api/v1/locations", new CreateLocationRequest(code.ToLower(), "Sucursal Nueva", LocationType.Branch, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var location = await created.Content.ReadJsonAsync<LocationDto>();
        Assert.Equal(code, location!.Code);
        Assert.False(location.CanPurchase);

        // The admin (locations.all) sees the new location right away.
        var me = await admin.GetJsonAsync<MeDto>("/api/v1/me");
        Assert.Contains(me!.Locations, l => l.Code == code);

        var duplicate = await admin.PostJsonAsync("/api/v1/locations", new CreateLocationRequest(code, "Otra", LocationType.Branch, null));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var updated = await admin.PutJsonAsync($"/api/v1/locations/{location.Id}",
            new UpdateLocationRequest(location.Version, "Sucursal Renombrada", "Calle 5", true));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        var stale = await admin.PutJsonAsync($"/api/v1/locations/{location.Id}",
            new UpdateLocationRequest(location.Version, "Otra vez", null, true));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("concurrency", await CodeOf(stale));
    }

    [Fact]
    public async Task A_user_manager_cannot_escalate_privileges()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, suc01, _) = await LocationIdsAsync();
        var role = await (await admin.PostJsonAsync("/api/v1/roles", new CreateRoleRequest(
            $"Gestor {Guid.NewGuid():N}"[..20], "Administra encargados",
            [Permissions.SecurityUsersManage, Permissions.InventoryView, Permissions.InventoryCount, Permissions.InventoryConsumption,
             Permissions.LogisticsView, Permissions.LogisticsOrdersCreate, Permissions.LogisticsTransfersReceive])))
            .Content.ReadJsonAsync<RoleDto>();
        var managerEmail = ApiFactory.UniqueEmail("gestor");
        await admin.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            managerEmail, "Gestor", ApiFactory.DefaultPassword, [role!.Id], [suc01], null));
        var manager = await factory.LoginAsync(managerEmail);

        // Grant a role with permissions the manager lacks.
        var escalate = await manager.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            ApiFactory.UniqueEmail("x"), "X", ApiFactory.DefaultPassword, [await RoleIdAsync(SystemRoles.AdministratorKey)], [suc01], null));
        Assert.Equal(HttpStatusCode.Forbidden, escalate.StatusCode);
        Assert.Equal(Guard.CannotGrantMessage, (await escalate.Content.ReadJsonAsync<ProblemDetails>())!.Detail);

        // Assign a location outside the manager's scope.
        var outside = await manager.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            ApiFactory.UniqueEmail("y"), "Y", ApiFactory.DefaultPassword, [await RoleIdAsync("branch_manager")], [plant], null));
        Assert.Equal(HttpStatusCode.Forbidden, outside.StatusCode);

        // Within limits it works.
        var ok = await manager.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            ApiFactory.UniqueEmail("z"), "Z", ApiFactory.DefaultPassword, [await RoleIdAsync("branch_manager")], [suc01], null));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);

        // Manage the administrator.
        await using var scope = factory.CreateScope();
        var adminId = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users
            .Where(u => u.Email == ApiFactory.AdminEmail).Select(u => u.Id).SingleAsync();
        var reset = await manager.PostJsonAsync($"/api/v1/users/{adminId}/reset-password", new ResetPasswordRequest("Hackeada2026x"));
        Assert.Equal(HttpStatusCode.Forbidden, reset.StatusCode);
    }

    [Fact]
    public async Task Administrator_role_always_keeps_every_permission()
    {
        var admin = await factory.LoginAsAdminAsync();
        var role = await admin.GetJsonAsync<RoleDto>($"/api/v1/roles/{await RoleIdAsync(SystemRoles.AdministratorKey)}");

        var response = await admin.PutJsonAsync($"/api/v1/roles/{role!.Id}",
            new UpdateRoleRequest(role.Version, role.Name, role.Description, role.Permissions.Skip(1).ToList()));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("admin_role_locked", await CodeOf(response));
    }

    [Fact]
    public async Task Role_permission_changes_apply_to_its_users_immediately()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, suc01, _) = await LocationIdsAsync();
        var role = await (await admin.PostJsonAsync("/api/v1/roles", new CreateRoleRequest(
            $"Temporal {Guid.NewGuid():N}"[..20], "Prueba", [Permissions.InventoryView]))).Content.ReadJsonAsync<RoleDto>();
        var email = ApiFactory.UniqueEmail("temporal");
        await admin.PostJsonAsync("/api/v1/users", new CreateUserRequest(email, "Temporal", ApiFactory.DefaultPassword, [role!.Id], [suc01], null));
        var user = await factory.LoginAsync(email);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/v1/locations")).StatusCode);

        var updated = await admin.PutJsonAsync($"/api/v1/roles/{role.Id}",
            new UpdateRoleRequest(role.Version, role.Name, role.Description, [Permissions.InventoryView, Permissions.LocationsView]));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync("/api/v1/locations")).StatusCode);
    }

    [Fact]
    public async Task Deactivated_users_lose_their_session_and_admins_cannot_deactivate_themselves()
    {
        var admin = await factory.LoginAsAdminAsync();
        var email = ApiFactory.UniqueEmail("baja");
        var userId = await factory.CreateUserAsync(email, ["read_only"], ["SUC-01"]);
        var user = await factory.LoginAsync(email);
        var dto = await admin.GetJsonAsync<UserDto>($"/api/v1/users/{userId}");

        var deactivate = await admin.PostJsonAsync($"/api/v1/users/{userId}/deactivate", new VersionRequest(dto!.Version));
        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);

        var rejected = await user.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        Assert.Equal("user_inactive", await CodeOf(rejected));

        var me = await admin.GetJsonAsync<MeDto>("/api/v1/me");
        var self = await admin.GetJsonAsync<UserDto>($"/api/v1/users/{me!.Id}");
        var selfDeactivate = await admin.PostJsonAsync($"/api/v1/users/{me.Id}/deactivate", new VersionRequest(self!.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, selfDeactivate.StatusCode);
    }

    [Fact]
    public async Task Audit_log_shows_the_history_of_a_user_including_roles_and_locations()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, suc01, _) = await LocationIdsAsync();
        var created = await (await admin.PostJsonAsync("/api/v1/users", new CreateUserRequest(
            ApiFactory.UniqueEmail("bitacora"), "Con Historial", ApiFactory.DefaultPassword, [await RoleIdAsync("read_only")], [suc01], null)))
            .Content.ReadJsonAsync<UserDto>();

        var log = await admin.GetJsonAsync<PagedResult<AuditLogDto>>($"/api/v1/audit-log?entityId={created!.Id}");

        Assert.Contains(log!.Items, a => a.EntityType == "AppUser" && a.Action == "Created" && a.UserName == "Administrador");
        Assert.Contains(log.Items, a => a.EntityType == "UserLocation");
        Assert.Contains(log.Items, a => a.EntityType == "IdentityUserRole`1");
        Assert.DoesNotContain(log.Items, a => a.Changes.ToString().Contains("PasswordHash"));
    }

    [Fact]
    public async Task Settings_are_typed_bounded_and_versioned()
    {
        var admin = await factory.LoginAsAdminAsync();
        var settings = await admin.GetJsonAsync<List<AppSettingDto>>("/api/v1/settings");
        var plan = settings!.Single(s => s.Key == AppSettingKeys.PlanDefaultDays);
        Assert.Equal(SettingKind.Integer, plan.Kind);
        Assert.Equal((1m, 14m), (plan.Min, plan.Max));

        var invalid = await admin.PutJsonAsync("/api/v1/settings",
            new UpdateSettingsRequest([new SettingValueRequest(AppSettingKeys.PlanDefaultDays, 15, plan.Version)]));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var ok = await admin.PutJsonAsync("/api/v1/settings",
            new UpdateSettingsRequest([new SettingValueRequest(AppSettingKeys.PlanDefaultDays, 2, plan.Version)]));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var saved = (await ok.Content.ReadJsonAsync<List<AppSettingDto>>())!.Single(s => s.Key == AppSettingKeys.PlanDefaultDays);
        Assert.Equal(2, saved.Value);
        Assert.Equal("Administrador", saved.UpdatedByName);

        var stale = await admin.PutJsonAsync("/api/v1/settings",
            new UpdateSettingsRequest([new SettingValueRequest(AppSettingKeys.PlanDefaultDays, 3, plan.Version)]));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }
}
