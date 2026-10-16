using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Infrastructure.Identity;

namespace Sgo.Infrastructure.Persistence.Configurations.Inventory;

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
        // Kardex of one item: page in sequence order, and the running balance as an index-only SUM (B-17).
        builder.HasIndex(m => new { m.LocationId, m.ItemId, m.Sequence }).IncludeProperties(m => m.Quantity);
        // Kardex of a whole location, newest first.
        builder.HasIndex(m => new { m.LocationId, m.Sequence });
        builder.HasIndex(m => new { m.SourceDocType, m.SourceDocId });
        builder.HasIndex(m => m.ItemId);
        builder.HasOne<Location>().WithMany().HasForeignKey(m => m.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(m => m.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(m => m.LotId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
