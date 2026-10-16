using Sgo.Application.Security;
using Sgo.Domain.Common;

namespace Sgo.UnitTests.Application;

public class LocationScopeTests
{
    private static readonly Guid Allowed = Guid.NewGuid();
    private static readonly Guid Other = Guid.NewGuid();

    private static LocationScope ScopeWith(params Guid[] locations) => new(new UserAccessContext
    {
        Access = new UserAccess(Guid.NewGuid(), true, new HashSet<string>(), false, locations.ToHashSet()),
    });

    [Fact]
    public void Allows_assigned_location() => ScopeWith(Allowed).EnsureAccess(Allowed);

    [Fact]
    public void Rejects_location_out_of_scope_with_spanish_message()
    {
        var ex = Assert.Throws<ForbiddenException>(() => ScopeWith(Allowed).EnsureAccess(Other));
        Assert.Equal(LocationScope.OutOfScopeMessage, ex.Message);
    }

    [Fact]
    public void Without_loaded_access_nothing_is_allowed()
    {
        var scope = new LocationScope(new UserAccessContext());
        Assert.Empty(scope.AllowedLocationIds);
        Assert.Throws<ForbiddenException>(() => scope.EnsureAccess(Allowed));
    }
}
