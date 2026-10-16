using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;

namespace Sgo.Infrastructure.Persistence.Configurations.Inventory;

internal sealed class InventoryAdjustmentConfiguration : IEntityTypeConfiguration<InventoryAdjustment>
{
    public void Configure(EntityTypeBuilder<InventoryAdjustment> builder)
    {
        builder.ToTable("adjustment", "inventory");
        builder.Property(a => a.Folio).HasMaxLength(30);
        builder.Property(a => a.Reason).HasMaxLength(20);
        builder.Property(a => a.Status).HasMaxLength(20);
        builder.Property(a => a.Notes).HasMaxLength(500);
        builder.HasIndex(a => a.Folio).IsUnique();
        builder.HasIndex(a => a.Status);
        builder.HasIndex(a => new { a.LocationId, a.CreatedAt });
        builder.HasOne<Location>().WithMany().HasForeignKey(a => a.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(a => a.Lines).WithOne().HasForeignKey(l => l.AdjustmentId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(a => a.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class InventoryAdjustmentLineConfiguration : IEntityTypeConfiguration<InventoryAdjustmentLine>
{
    public void Configure(EntityTypeBuilder<InventoryAdjustmentLine> builder)
    {
        builder.ToTable("adjustment_line", "inventory");
        builder.Property(l => l.Notes).HasMaxLength(500);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(l => l.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}
