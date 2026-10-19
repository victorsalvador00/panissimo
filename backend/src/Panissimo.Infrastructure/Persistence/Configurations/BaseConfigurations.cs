using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Identity;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> builder)
    {
        builder.ToTable("location", "org");
        builder.HasIndex(l => l.ParentLocationId);
        builder.HasOne<Location>().WithMany().HasForeignKey(l => l.ParentLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(l => l.Code).HasMaxLength(20);
        builder.Property(l => l.Name).HasMaxLength(150);
        builder.Property(l => l.Type).HasMaxLength(20);
        builder.Property(l => l.Address).HasMaxLength(500);
        builder.Property(l => l.SuppliesTypes).HasColumnType("text[]");
        builder.HasIndex(l => l.Code).IsUnique();
    }
}

internal sealed class ProductionAreaConfiguration : IEntityTypeConfiguration<ProductionArea>
{
    public void Configure(EntityTypeBuilder<ProductionArea> builder)
    {
        builder.ToTable("production_area", "production");
        builder.Property(a => a.Code).HasMaxLength(20);
        builder.Property(a => a.Name).HasMaxLength(100);
        builder.HasIndex(a => a.Code).IsUnique();
    }
}

internal sealed class AppSettingConfiguration : IEntityTypeConfiguration<AppSetting>
{
    public void Configure(EntityTypeBuilder<AppSetting> builder)
    {
        builder.ToTable("app_setting", "org");
        builder.HasKey(s => s.Key);
        builder.Property(s => s.Key).HasMaxLength(100);
        builder.Property(s => s.Value).HasMaxLength(100);
        builder.Ignore(s => s.DecimalValue);
    }
}

internal sealed class UnitOfMeasureConfiguration : IEntityTypeConfiguration<UnitOfMeasure>
{
    public void Configure(EntityTypeBuilder<UnitOfMeasure> builder)
    {
        builder.ToTable("unit_of_measure", "catalog");
        builder.Property(u => u.Code).HasMaxLength(20);
        builder.Property(u => u.Name).HasMaxLength(100);
        builder.Property(u => u.Kind).HasMaxLength(20);
        builder.HasIndex(u => u.Code).IsUnique();
    }
}

internal sealed class KnownPermissionConfiguration : IEntityTypeConfiguration<KnownPermission>
{
    public void Configure(EntityTypeBuilder<KnownPermission> builder)
    {
        builder.ToTable("known_permission", "security");
        builder.HasKey(p => p.Code);
        builder.Property(p => p.Code).HasMaxLength(100);
    }
}

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

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_token", "security");
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.Property(t => t.CreatedByIp).HasMaxLength(45);
        builder.Property(t => t.RevokedReason).HasMaxLength(30);
        // Two concurrent refreshes with the same token: only the first rotation wins.
        builder.Property(t => t.RevokedAt).IsConcurrencyToken();
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.FamilyId);
        builder.HasIndex(t => t.UserId);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
