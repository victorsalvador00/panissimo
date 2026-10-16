using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Organization;

namespace Sgo.Infrastructure.Persistence.Configurations.Organization;

internal sealed class LocationConfiguration : IEntityTypeConfiguration<Location>
{
    public void Configure(EntityTypeBuilder<Location> builder)
    {
        builder.ToTable("location", "org");
        builder.Property(l => l.Code).HasMaxLength(20);
        builder.Property(l => l.Name).HasMaxLength(150);
        builder.Property(l => l.Type).HasMaxLength(20);
        builder.Property(l => l.Address).HasMaxLength(500);
        builder.HasIndex(l => l.Code).IsUnique();
    }
}

internal sealed class AppSettingConfiguration : IEntityTypeConfiguration<AppSetting>
{
    public void Configure(EntityTypeBuilder<AppSetting> builder)
    {
        builder.ToTable("app_setting", "org");
        builder.HasKey(s => s.Key);
        builder.Property(s => s.Key).HasMaxLength(100);
        builder.Property(s => s.Value).HasMaxLength(1000);
        builder.Property(s => s.Description).HasMaxLength(500);
    }
}
