using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class RecipeConfiguration : IEntityTypeConfiguration<Recipe>
{
    public void Configure(EntityTypeBuilder<Recipe> builder)
    {
        builder.ToTable("recipe", "production");
        builder.Property(r => r.Notes).HasMaxLength(1000);
        builder.HasIndex(r => new { r.OutputItemId, r.VersionNumber }).IsUnique();
        // RN-10: only one active recipe per item.
        builder.HasIndex(r => r.OutputItemId).IsUnique().HasFilter("is_active")
            .HasDatabaseName("ux_recipe_one_active_per_item");
        builder.HasOne<Item>().WithMany().HasForeignKey(r => r.OutputItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(r => r.FactoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(r => r.FactoryId);
        builder.HasMany(r => r.Lines).WithOne().HasForeignKey(l => l.RecipeId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(r => r.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class RecipeLineConfiguration : IEntityTypeConfiguration<RecipeLine>
{
    public void Configure(EntityTypeBuilder<RecipeLine> builder)
    {
        builder.ToTable("recipe_line", "production");
        builder.Property(l => l.WastePct).HasPrecision(5, 2);
        builder.HasIndex(l => l.ComponentItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ComponentItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ProductionOrderConfiguration : IEntityTypeConfiguration<ProductionOrder>
{
    public void Configure(EntityTypeBuilder<ProductionOrder> builder)
    {
        builder.ToTable("production_order", "production");
        builder.Property(o => o.Folio).HasMaxLength(30);
        builder.Property(o => o.Status).HasMaxLength(20);
        builder.Property(o => o.Source).HasMaxLength(20);
        builder.Property(o => o.Shift).HasMaxLength(20);
        builder.Property(o => o.ShortfallReason).HasMaxLength(30);
        builder.Property(o => o.Notes).HasMaxLength(500);
        builder.Property(o => o.ShortfallNotes).HasMaxLength(500);
        builder.Ignore(o => o.PendingQty);
        builder.Ignore(o => o.IsOpen);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => o.Status);
        builder.HasIndex(o => new { o.LocationId, o.ScheduledDate, o.Status });
        builder.HasIndex(o => new { o.OutputItemId, o.ScheduledDate });
        builder.HasIndex(o => o.ImportId);
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Recipe>().WithMany().HasForeignKey(o => o.RecipeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(o => o.OutputItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ProductionOrderImport>().WithMany().HasForeignKey(o => o.ImportId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.ProductionOrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ProductionOrderLineConfiguration : IEntityTypeConfiguration<ProductionOrderLine>
{
    public void Configure(EntityTypeBuilder<ProductionOrderLine> builder)
    {
        builder.ToTable("production_order_line", "production");
        builder.HasIndex(l => new { l.ProductionOrderId, l.ComponentItemId }).IsUnique();
        builder.HasIndex(l => l.ComponentItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ComponentItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(l => l.SourceLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(l => l.SourceLocationId);
    }
}

internal sealed class ProductionOrderImportConfiguration : IEntityTypeConfiguration<ProductionOrderImport>
{
    public void Configure(EntityTypeBuilder<ProductionOrderImport> builder)
    {
        builder.ToTable("production_order_import", "production");
        builder.Property(i => i.Folio).HasMaxLength(30);
        builder.Property(i => i.FileName).HasMaxLength(255);
        builder.Property(i => i.FileSha256).HasMaxLength(64);
        builder.HasIndex(i => i.Folio).IsUnique();
        builder.HasIndex(i => i.FileSha256);
    }
}

internal sealed class ProductionCloseConfiguration : IEntityTypeConfiguration<ProductionClose>
{
    public void Configure(EntityTypeBuilder<ProductionClose> builder)
    {
        builder.ToTable("production_close", "production");
        builder.HasOne<Location>().WithMany().HasForeignKey(c => c.OutputLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(c => c.Folio).HasMaxLength(30);
        builder.Property(c => c.Kind).HasMaxLength(20);
        builder.Property(c => c.Shift).HasMaxLength(20);
        builder.Property(c => c.Notes).HasMaxLength(500);
        builder.Ignore(c => c.WasteQty);
        builder.Ignore(c => c.WasteCost);
        builder.HasIndex(c => c.Folio).IsUnique();
        // RN-66: one close per sequence of an order.
        builder.HasIndex(c => new { c.ProductionOrderId, c.Sequence }).IsUnique();
        builder.HasIndex(c => c.BusinessDate);
        // The close list sorts by closing time by default (docs/rendimiento.md).
        builder.HasIndex(c => c.ClosedAt);
        builder.HasOne<ProductionOrder>().WithMany().HasForeignKey(c => c.ProductionOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(c => c.OutputLotId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(c => c.Lines).WithOne().HasForeignKey(l => l.ProductionCloseId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(c => c.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ProductionCloseLineConfiguration : IEntityTypeConfiguration<ProductionCloseLine>
{
    public void Configure(EntityTypeBuilder<ProductionCloseLine> builder)
    {
        builder.ToTable("production_close_line", "production");
        builder.HasOne<Location>().WithMany().HasForeignKey(c => c.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(l => l.ComponentItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ComponentItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(l => l.Lots).WithOne().HasForeignKey(x => x.LineId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(l => l.Lots).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ProductionCloseLineLotConfiguration : IEntityTypeConfiguration<ProductionCloseLineLot>
{
    public void Configure(EntityTypeBuilder<ProductionCloseLineLot> builder)
    {
        builder.ToTable("production_close_line_lot", "production");
        builder.HasOne<Lot>().WithMany().HasForeignKey(x => x.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ProductionOrderDemandConfiguration : IEntityTypeConfiguration<ProductionOrderDemand>
{
    public void Configure(EntityTypeBuilder<ProductionOrderDemand> builder)
    {
        builder.ToTable("production_order_demand", "production");
        builder.Property(d => d.DemandType).HasMaxLength(30);
        builder.HasIndex(d => d.ProductionOrderId);
        builder.HasIndex(d => new { d.DemandType, d.DemandLineId });
        builder.HasOne<ProductionOrder>().WithMany().HasForeignKey(d => d.ProductionOrderId).OnDelete(DeleteBehavior.Cascade);
    }
}
