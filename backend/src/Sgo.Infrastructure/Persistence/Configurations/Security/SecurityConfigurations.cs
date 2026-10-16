using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Organization;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Identity;

namespace Sgo.Infrastructure.Persistence.Configurations.Security;

internal sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> builder)
    {
        builder.ToTable("role_permission", "security");
        builder.HasKey(rp => new { rp.RoleId, rp.PermissionCode });
        builder.Property(rp => rp.PermissionCode).HasMaxLength(100);
        builder.HasOne<AppRole>().WithMany().HasForeignKey(rp => rp.RoleId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class UserLocationConfiguration : IEntityTypeConfiguration<UserLocation>
{
    public void Configure(EntityTypeBuilder<UserLocation> builder)
    {
        builder.ToTable("user_location", "security");
        builder.HasKey(ul => new { ul.UserId, ul.LocationId });
        builder.HasOne<AppUser>().WithMany().HasForeignKey(ul => ul.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Location>().WithMany().HasForeignKey(ul => ul.LocationId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AppUserConfiguration : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> builder) =>
        builder.HasOne<Location>().WithMany().HasForeignKey(u => u.DefaultLocationId).OnDelete(DeleteBehavior.Restrict);
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("audit_log", "audit");
        builder.Property(a => a.Action).HasMaxLength(20);
        builder.Property(a => a.EntityType).HasMaxLength(100);
        builder.Property(a => a.EntityId).HasMaxLength(100);
        builder.Property(a => a.ChangesJson).HasColumnType("jsonb");
        builder.Property(a => a.IpAddress).HasMaxLength(45);
        builder.HasIndex(a => new { a.EntityType, a.EntityId });
        builder.HasIndex(a => a.OccurredAt);
        builder.HasIndex(a => a.UserId);
    }
}
