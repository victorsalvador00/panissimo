using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Sgo.Application.Security;

namespace Sgo.Api.Auth;

/// <summary>Requires the caller to hold <paramref name="permission"/> (dominio §6).</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequirePermissionAttribute(string permission)
    : AuthorizeAttribute(PermissionPolicyProvider.Prefix + permission)
{
    public string Permission { get; } = permission;
}

/// <summary>Requires the caller to hold at least one of <paramref name="permissions"/> (read-only lookups shared by modules).</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequireAnyPermissionAttribute(params string[] permissions)
    : AuthorizeAttribute(PermissionPolicyProvider.Prefix + string.Join(PermissionPolicyProvider.AnySeparator, permissions))
{
    public IReadOnlyList<string> Permissions { get; } = permissions;
}

/// <summary>Satisfied when the caller holds any of <see cref="AnyOf"/> (one element for [RequirePermission]).</summary>
public sealed record PermissionRequirement(IReadOnlyList<string> AnyOf) : IAuthorizationRequirement;

/// <summary>Builds "perm:&lt;code&gt;" policies on demand instead of registering one per permission.</summary>
public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options)
    : DefaultAuthorizationPolicyProvider(options)
{
    public const string Prefix = "perm:";
    public const char AnySeparator = '|';

    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(Prefix, StringComparison.Ordinal))
            return await base.GetPolicyAsync(policyName);

        var permissions = policyName[Prefix.Length..].Split(AnySeparator);
        foreach (var permission in permissions)
        {
            if (!Domain.Security.Permissions.IsValid(permission))
                throw new InvalidOperationException($"Unknown permission '{permission}' in [RequirePermission].");
        }

        return new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(permissions))
            .Build();
    }
}

public sealed class PermissionAuthorizationHandler(UserAccessContext accessContext)
    : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (accessContext.Access is { IsActive: true } access && requirement.AnyOf.Any(access.Has))
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
