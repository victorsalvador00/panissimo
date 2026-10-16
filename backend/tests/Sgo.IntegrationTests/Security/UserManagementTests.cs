using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Organization;
using Sgo.Application.Security;
using Sgo.Domain.Security;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Security;

[Collection(ApiCollection.Name)]
public class UserManagementTests(SgoApiFactory factory)
{
    private const string Users = "/api/v1/users";
    private const string BranchManager = "Encargado de sucursal";

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private async Task<Guid> RoleIdAsync(string name)
    {
        await using var scope = factory.CreateScope();
        return await SgoApiFactory.Db(scope).Roles.Where(r => r.Name == name).Select(r => r.Id).SingleAsync();
    }

    private async Task<CreateUserRequest> NewUserRequestAsync(string role = BranchManager, params string[] locations)
    {
        var locationIds = new List<Guid>();
        foreach (var code in locations.DefaultIfEmpty("SUC-01"))
            locationIds.Add(await factory.LocationIdAsync(code));
        return new CreateUserRequest($"nuevo-{Guid.NewGuid():N}@sgo.test", "Laura Méndez", "Temporal2024x",
            [await RoleIdAsync(role)], locationIds, locationIds[0]);
    }

    [Fact]
    public async Task Admin_creates_user_who_then_sees_only_what_is_allowed()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync(BranchManager, "SUC-01");

        var created = await admin.PostAsJsonAsync(Users, request);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var user = (await created.Content.ReadFromJsonAsync<UserDto>())!;
        Assert.True(user.IsActive);
        Assert.Equal(request.LocationIds, user.LocationIds);

        var client = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);
        var me = (await client.GetFromJsonAsync<MeDto>("/api/v1/me"))!;
        Assert.Equal(SystemRoles.All.Single(r => r.Name == BranchManager).Permissions.Order(), me.Permissions);
        Assert.Equal(["SUC-01"], me.Locations.Select(l => l.Code));
        Assert.Equal(request.DefaultLocationId, me.DefaultLocationId);

        // Outside their permissions and locations.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Users)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/test-probe/adjust")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync($"/api/v1/test-probe/locations/{await factory.LocationIdAsync("SUC-02")}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.GetAsync($"/api/v1/test-probe/locations/{await factory.LocationIdAsync("SUC-01")}")).StatusCode);
    }

    [Fact]
    public async Task Create_rejects_invalid_assignments_with_errors_per_field()
    {
        var admin = await AdminAsync();
        var valid = await NewUserRequestAsync();

        var noRoles = await admin.PostAsJsonAsync(Users, valid with { RoleIds = [] });
        Assert.Equal(HttpStatusCode.BadRequest, noRoles.StatusCode);
        Assert.Equal("Asigna al menos un rol.", (await noRoles.ProblemAsync()).GetProperty("errors").GetProperty("roleIds")[0].GetString());

        var badDefault = await admin.PostAsJsonAsync(Users, valid with { DefaultLocationId = await factory.LocationIdAsync("SUC-09") });
        Assert.Equal(HttpStatusCode.BadRequest, badDefault.StatusCode);
        Assert.True((await badDefault.ProblemAsync()).GetProperty("errors").TryGetProperty("defaultLocationId", out _));

        var unknownRole = await admin.PostAsJsonAsync(Users, valid with { RoleIds = [Guid.NewGuid()] });
        Assert.Equal(HttpStatusCode.BadRequest, unknownRole.StatusCode);
        Assert.True((await unknownRole.ProblemAsync()).GetProperty("errors").TryGetProperty("roleIds", out _));

        var weakPassword = await admin.PostAsJsonAsync(Users, valid with { Password = "debil" });
        Assert.Equal(HttpStatusCode.BadRequest, weakPassword.StatusCode);
        Assert.Contains("La contraseña debe tener al menos 10 caracteres.",
            (await weakPassword.ProblemAsync()).GetProperty("errors").GetProperty("password").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task Duplicate_email_is_rejected_in_spanish()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync();
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync(Users, request)).StatusCode);

        var duplicate = await admin.PostAsJsonAsync(Users, request);

        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains("ya está registrado",
            (await duplicate.ProblemAsync()).GetProperty("errors").GetProperty("email")[0].GetString());
    }

    [Fact]
    public async Task Update_changes_permissions_and_locations_immediately_and_checks_version()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync(BranchManager, "SUC-01");
        var user = (await (await admin.PostAsJsonAsync(Users, request)).Content.ReadFromJsonAsync<UserDto>())!;
        var client = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);

        var locations = new List<Guid> { await factory.LocationIdAsync("SUC-04"), await factory.LocationIdAsync("SUC-05") };
        var update = new UpdateUserRequest(user.Version, "Laura Méndez Ruiz", [await RoleIdAsync("Almacén comisariato/fábrica")], locations, locations[1]);
        var updated = await admin.PutAsJsonAsync($"{Users}/{user.Id}", update);

        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var dto = (await updated.Content.ReadFromJsonAsync<UserDto>())!;
        Assert.NotEqual(user.Version, dto.Version);

        // Same access token: the new permissions and locations apply on the next request.
        var me = (await client.GetFromJsonAsync<MeDto>("/api/v1/me"))!;
        Assert.Contains(Permissions.InventoryAdjust, me.Permissions);
        Assert.Equal(["SUC-04", "SUC-05"], me.Locations.Select(l => l.Code));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/test-probe/adjust")).StatusCode);

        var stale = await admin.PutAsJsonAsync($"{Users}/{user.Id}", update);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("concurrency", await stale.ProblemCodeAsync());
    }

    [Fact]
    public async Task Deactivate_blocks_the_user_immediately_and_activate_restores_access()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync();
        var user = (await (await admin.PostAsJsonAsync(Users, request)).Content.ReadFromJsonAsync<UserDto>())!;
        var client = await factory.CreateAuthenticatedClientAsync(request.Email, request.Password);

        var deactivated = await admin.PostAsJsonAsync($"{Users}/{user.Id}/deactivate", new VersionRequest(user.Version));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        var dto = (await deactivated.Content.ReadFromJsonAsync<UserDto>())!;
        Assert.False(dto.IsActive);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateApiClient().PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(request.Email, request.Password))).StatusCode);

        var activated = await admin.PostAsJsonAsync($"{Users}/{user.Id}/activate", new VersionRequest(dto.Version));
        Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await factory.CreateApiClient().PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(request.Email, request.Password))).StatusCode);
    }

    [Fact]
    public async Task Admin_cannot_deactivate_themselves()
    {
        var admin = await AdminAsync();
        var me = (await admin.GetFromJsonAsync<MeDto>("/api/v1/me"))!;
        var self = (await admin.GetFromJsonAsync<UserDto>($"{Users}/{me.Id}"))!;

        var response = await admin.PostAsJsonAsync($"{Users}/{me.Id}/deactivate", new VersionRequest(self.Version));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("cannot_lock_yourself_out", await response.ProblemCodeAsync());
    }

    [Fact]
    public async Task Reset_password_unlocks_the_account_and_sets_a_temporary_password()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync();
        var user = (await (await admin.PostAsJsonAsync(Users, request)).Content.ReadFromJsonAsync<UserDto>())!;
        var anonymous = factory.CreateApiClient();
        for (var i = 0; i < 5; i++)
            await anonymous.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(request.Email, "Incorrecta123"));
        Assert.True((await admin.GetFromJsonAsync<UserDto>($"{Users}/{user.Id}"))!.IsLockedOut);

        var reset = await admin.PostAsJsonAsync($"{Users}/{user.Id}/reset-password", new ResetPasswordRequest("Temporal2025y"));

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.False((await admin.GetFromJsonAsync<UserDto>($"{Users}/{user.Id}"))!.IsLockedOut);
        Assert.Equal(HttpStatusCode.OK,
            (await factory.CreateApiClient().PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(request.Email, "Temporal2025y"))).StatusCode);
    }

    [Fact]
    public async Task List_filters_by_text_role_location_and_status()
    {
        var admin = await AdminAsync();
        var request = await NewUserRequestAsync("Consulta", "SUC-08") with { FullName = "Zacarías Buscable" };
        var user = (await (await admin.PostAsJsonAsync(Users, request)).Content.ReadFromJsonAsync<UserDto>())!;
        var roleId = await RoleIdAsync("Consulta");
        var locationId = await factory.LocationIdAsync("SUC-08");

        var page = (await admin.GetFromJsonAsync<PagedResult<UserListItemDto>>(
            $"{Users}?q=zacarías&roleId={roleId}&locationId={locationId}&isActive=true&pageSize=100"))!;

        var item = Assert.Single(page.Items);
        Assert.Equal(user.Id, item.Id);
        Assert.Equal(["Consulta"], item.Roles);
        Assert.Equal(["SUC-08"], item.LocationCodes);

        var invalidSort = await admin.GetAsync($"{Users}?sort=password:asc");
        Assert.Equal(HttpStatusCode.BadRequest, invalidSort.StatusCode);
    }

    [Fact]
    public async Task User_manager_cannot_escalate_privileges()
    {
        // A limited user manager: can manage users, holds only inventory.view and SUC-01.
        var admin = await AdminAsync();
        var role = (await (await admin.PostAsJsonAsync("/api/v1/roles", new CreateRoleRequest(
            $"Gestor limitado {Guid.NewGuid():N}"[..30], "Prueba", [Permissions.SecurityUsersManage, Permissions.InventoryView])))
            .Content.ReadFromJsonAsync<RoleDto>())!;
        var managerRequest = await NewUserRequestAsync(BranchManager, "SUC-01") with { RoleIds = [role.Id] };
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync(Users, managerRequest)).StatusCode);
        var manager = await factory.CreateAuthenticatedClientAsync(managerRequest.Email, managerRequest.Password);

        var asAdmin = await manager.PostAsJsonAsync(Users, await NewUserRequestAsync(SystemRoles.Administrator, "SUC-01"));
        Assert.Equal(HttpStatusCode.Forbidden, asAdmin.StatusCode);

        var otherLocation = await manager.PostAsJsonAsync(Users,
            (await NewUserRequestAsync(BranchManager, "SUC-02")) with { RoleIds = [role.Id] });
        Assert.Equal(HttpStatusCode.Forbidden, otherLocation.StatusCode);

        var adminId = (await admin.GetFromJsonAsync<MeDto>("/api/v1/me"))!.Id;
        var adminVersion = (await admin.GetFromJsonAsync<UserDto>($"{Users}/{adminId}"))!.Version;
        var deactivateAdmin = await manager.PostAsJsonAsync($"{Users}/{adminId}/deactivate", new VersionRequest(adminVersion));
        Assert.Equal(HttpStatusCode.Forbidden, deactivateAdmin.StatusCode);

        var allowed = await manager.PostAsJsonAsync(Users,
            (await NewUserRequestAsync(BranchManager, "SUC-01")) with { RoleIds = [role.Id] });
        Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
    }

    [Fact]
    public async Task Creating_a_user_is_written_to_the_audit_log_with_the_author()
    {
        var admin = await AdminAsync();
        var adminId = (await admin.GetFromJsonAsync<MeDto>("/api/v1/me"))!.Id;
        var user = (await (await admin.PostAsJsonAsync(Users, await NewUserRequestAsync())).Content.ReadFromJsonAsync<UserDto>())!;

        var page = (await admin.GetFromJsonAsync<PagedResult<AuditLogDto>>(
            $"/api/v1/audit-log?entityType=AppUser&entityId={user.Id}"))!;

        var entry = Assert.Single(page.Items);
        Assert.Equal("Created", entry.Action);
        Assert.Equal(adminId, entry.UserId);
        Assert.Equal("Administrador", entry.UserName);
        Assert.False(entry.Changes.TryGetProperty("PasswordHash", out _));

        var roleAssignments = (await admin.GetFromJsonAsync<PagedResult<AuditLogDto>>(
            $"/api/v1/audit-log?entityType=IdentityUserRole`1&userId={adminId}&pageSize=100"))!;
        Assert.Contains(roleAssignments.Items, a => a.EntityId.StartsWith(user.Id.ToString(), StringComparison.Ordinal));

        // The user's history (entityId only, as the audit panel asks) includes its role and location assignments.
        var history = (await admin.GetFromJsonAsync<PagedResult<AuditLogDto>>($"/api/v1/audit-log?entityId={user.Id}&pageSize=100"))!;
        Assert.Contains(history.Items, a => a.EntityType == "AppUser" && a.EntityId == user.Id.ToString());
        Assert.Contains(history.Items, a => a.EntityType == "IdentityUserRole`1" && a.EntityId.StartsWith($"{user.Id}|", StringComparison.Ordinal));
        Assert.Contains(history.Items, a => a.EntityType == "UserLocation" && a.EntityId.StartsWith($"{user.Id}|", StringComparison.Ordinal));
        Assert.All(history.Items, a => Assert.True(a.EntityId == user.Id.ToString() || a.EntityId.StartsWith($"{user.Id}|", StringComparison.Ordinal)));
    }

    [Fact]
    public async Task Audit_log_requires_its_permission()
    {
        var user = await factory.CreateUserAsync(BranchManager, "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/audit-log")).StatusCode);
    }
}
