using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Infrastructure.Identity;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class LotConfiguration : IEntityTypeConfiguration<Lot>
{
    public void Configure(EntityTypeBuilder<Lot> builder)
    {
        builder.ToTable("lot", "inventory");
        builder.Property(l => l.LotNumber).HasMaxLength(50);
        builder.Property(l => l.CreatedFromDocType).HasMaxLength(30);
        builder.HasIndex(l => new { l.ItemId, l.LotNumber }).IsUnique();
        builder.HasIndex(l => new { l.ItemId, l.ExpirationDate });
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class StockBalanceConfiguration : IEntityTypeConfiguration<StockBalance>
{
    public void Configure(EntityTypeBuilder<StockBalance> builder)
    {
        builder.ToTable("stock_balance", "inventory");
        // One row per (location, item, lot) — "no lot" counts as a value too (Postgres 15+ NULLS NOT DISTINCT).
        builder.HasIndex(b => new { b.LocationId, b.ItemId, b.LotId }).IsUnique().AreNullsDistinct(false);
        builder.HasIndex(b => b.ItemId);
        builder.HasOne<Location>().WithMany().HasForeignKey(b => b.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(b => b.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(b => b.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ItemLocationCostConfiguration : IEntityTypeConfiguration<ItemLocationCost>
{
    public void Configure(EntityTypeBuilder<ItemLocationCost> builder)
    {
        builder.ToTable("item_location_cost", "inventory");
        builder.HasKey(c => new { c.LocationId, c.ItemId });
        builder.HasOne<Location>().WithMany().HasForeignKey(c => c.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(c => c.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class InventoryMovementConfiguration : IEntityTypeConfiguration<InventoryMovement>
{
    public void Configure(EntityTypeBuilder<InventoryMovement> builder)
    {
        builder.ToTable("inventory_movement", "inventory");
        builder.Property(m => m.Type).HasMaxLength(30);
        builder.Property(m => m.SourceDocType).HasMaxLength(30);
        builder.Property(m => m.SourceDocFolio).HasMaxLength(30);
        builder.Property(m => m.Notes).HasMaxLength(500);
        builder.Property(m => m.Sequence).UseIdentityAlwaysColumn();
        builder.HasIndex(m => m.Sequence).IsUnique();
        builder.HasIndex(m => new { m.LocationId, m.ItemId, m.OccurredAt });
        // Kardex of one item: page in sequence order, and the running balance as an index-only SUM.
        builder.HasIndex(m => new { m.LocationId, m.ItemId, m.Sequence }).IncludeProperties(m => m.Quantity);
        // Kardex of a whole location, newest first.
        builder.HasIndex(m => new { m.LocationId, m.Sequence });
        builder.HasIndex(m => new { m.SourceDocType, m.SourceDocId });
        builder.HasIndex(m => new { m.ItemId, m.Type, m.BusinessDate });
        builder.HasOne<Location>().WithMany().HasForeignKey(m => m.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(m => m.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(m => m.LotId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}

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
        builder.Property(l => l.WasteReason).HasMaxLength(20);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(l => l.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}

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
