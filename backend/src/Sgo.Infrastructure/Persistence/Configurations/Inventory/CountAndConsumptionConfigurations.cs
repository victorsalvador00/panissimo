using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;

namespace Sgo.Infrastructure.Persistence.Configurations.Inventory;

internal sealed class PhysicalCountConfiguration : IEntityTypeConfiguration<PhysicalCount>
{
    public void Configure(EntityTypeBuilder<PhysicalCount> builder)
    {
        builder.ToTable("physical_count", "inventory");
        builder.Property(c => c.Folio).HasMaxLength(30);
        builder.Property(c => c.Status).HasMaxLength(20);
        builder.Property(c => c.Notes).HasMaxLength(500);
        builder.HasIndex(c => c.Folio).IsUnique();
        builder.HasIndex(c => c.Status);
        // RN-06: only one count in progress per location.
        builder.HasIndex(c => c.LocationId).IsUnique().HasFilter("status = 'InProgress'")
            .HasDatabaseName("ux_physical_count_one_in_progress_per_location");
        builder.HasOne<Location>().WithMany().HasForeignKey(c => c.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ItemCategory>().WithMany().HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(c => c.Lines).WithOne().HasForeignKey(l => l.CountId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class PhysicalCountLineConfiguration : IEntityTypeConfiguration<PhysicalCountLine>
{
    public void Configure(EntityTypeBuilder<PhysicalCountLine> builder)
    {
        builder.ToTable("physical_count_line", "inventory");
        builder.HasIndex(l => new { l.CountId, l.ItemId, l.LotId }).IsUnique().AreNullsDistinct(false);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(l => l.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ConsumptionEntryConfiguration : IEntityTypeConfiguration<ConsumptionEntry>
{
    public void Configure(EntityTypeBuilder<ConsumptionEntry> builder)
    {
        builder.ToTable("consumption", "inventory");
        builder.Property(c => c.Folio).HasMaxLength(30);
        builder.Property(c => c.Status).HasMaxLength(20);
        builder.Property(c => c.Notes).HasMaxLength(500);
        builder.HasIndex(c => c.Folio).IsUnique();
        builder.HasIndex(c => c.Status);
        builder.HasIndex(c => new { c.LocationId, c.BusinessDate });
        builder.HasOne<Location>().WithMany().HasForeignKey(c => c.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(c => c.Lines).WithOne().HasForeignKey(l => l.EntryId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ConsumptionLineConfiguration : IEntityTypeConfiguration<ConsumptionLine>
{
    public void Configure(EntityTypeBuilder<ConsumptionLine> builder)
    {
        builder.ToTable("consumption_line", "inventory");
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(l => l.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}
