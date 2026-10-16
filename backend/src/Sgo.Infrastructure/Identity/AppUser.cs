using Microsoft.AspNetCore.Identity;
using Sgo.Domain.Common;

namespace Sgo.Infrastructure.Identity;

/// <summary>SGO AR user (dominio §4.7) on top of ASP.NET Core Identity.</summary>
[Audited]
public class AppUser : IdentityUser<Guid>, IVersioned
{
    private AppUser() { }

    public AppUser(string email, string fullName)
    {
        Id = Guid.CreateVersion7();
        Email = email;
        UserName = email;
        FullName = fullName;
        IsActive = true;
    }

    public string FullName { get; set; } = null!;
    public bool IsActive { get; set; }
    public Guid? DefaultLocationId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
    public uint Version { get; private set; }
}
