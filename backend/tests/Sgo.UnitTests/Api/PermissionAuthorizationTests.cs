using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Sgo.Api.Auth;
using Sgo.Application.Security;
using Sgo.Domain.Security;

namespace Sgo.UnitTests.Api;

public class PermissionAuthorizationTests
{
    private static PermissionPolicyProvider Provider() => new(Options.Create(new AuthorizationOptions()));

    [Fact]
    public async Task Builds_policy_for_known_permission()
    {
        var policy = await Provider().GetPolicyAsync(PermissionPolicyProvider.Prefix + Permissions.InventoryAdjust);

        var requirement = Assert.Single(policy!.Requirements.OfType<PermissionRequirement>());
        Assert.Equal([Permissions.InventoryAdjust], requirement.AnyOf);
    }

    [Fact]
    public async Task Unknown_permission_is_a_programming_error() =>
        await Assert.ThrowsAsync<InvalidOperationException>(() => Provider().GetPolicyAsync("perm:inventory.delete"));

    [Theory]
    [InlineData(true, true, true)]
    [InlineData(false, true, false)]
    [InlineData(true, false, false)]
    public async Task Handler_requires_active_user_with_permission(bool hasPermission, bool isActive, bool expected)
    {
        var permissions = hasPermission ? new HashSet<string> { Permissions.InventoryView } : [];
        var accessContext = new UserAccessContext
        {
            Access = new UserAccess(Guid.NewGuid(), isActive, permissions, false, new HashSet<Guid>()),
        };
        var requirement = new PermissionRequirement([Permissions.InventoryView]);
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(), null);

        await new PermissionAuthorizationHandler(accessContext).HandleAsync(context);

        Assert.Equal(expected, context.HasSucceeded);
    }

    [Fact]
    public async Task Any_of_policy_accepts_any_listed_permission()
    {
        var policy = await Provider().GetPolicyAsync(
            new RequireAnyPermissionAttribute(Permissions.CatalogView, Permissions.InventoryView).Policy!);
        var requirement = Assert.Single(policy!.Requirements.OfType<PermissionRequirement>());
        Assert.Equal([Permissions.CatalogView, Permissions.InventoryView], requirement.AnyOf);

        var accessContext = new UserAccessContext
        {
            Access = new UserAccess(Guid.NewGuid(), true, new HashSet<string> { Permissions.InventoryView }, false, new HashSet<Guid>()),
        };
        var context = new AuthorizationHandlerContext([requirement], new ClaimsPrincipal(), null);
        await new PermissionAuthorizationHandler(accessContext).HandleAsync(context);

        Assert.True(context.HasSucceeded);
    }

    [Fact]
    public async Task Any_of_policy_rejects_unknown_permissions() =>
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Provider().GetPolicyAsync(PermissionPolicyProvider.Prefix + "catalog.view|inventory.delete"));
}
