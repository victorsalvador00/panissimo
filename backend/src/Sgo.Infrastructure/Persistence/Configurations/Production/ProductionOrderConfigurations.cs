using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Production;

namespace Sgo.Infrastructure.Persistence.Configurations.Production;

internal sealed class ProductionOrderConfiguration : IEntityTypeConfiguration<ProductionOrder>
{
    public void Configure(EntityTypeBuilder<ProductionOrder> builder)
    {
        builder.ToTable("production_order", "production");
        builder.Property(o => o.Folio).HasMaxLength(30);
        builder.Property(o => o.Status).HasMaxLength(20);
        builder.Property(o => o.Notes).HasMaxLength(500);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => o.Status);
        builder.HasIndex(o => new { o.LocationId, o.ScheduledDate });
        builder.HasIndex(o => o.RecipeId);
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Recipe>().WithMany().HasForeignKey(o => o.RecipeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(o => o.OutputItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(o => o.OutputLotId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.OrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ProductionOrderLineConfiguration : IEntityTypeConfiguration<ProductionOrderLine>
{
    public void Configure(EntityTypeBuilder<ProductionOrderLine> builder)
    {
        builder.ToTable("production_order_line", "production");
        builder.Ignore(l => l.WasteQty);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ComponentItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(l => l.Lots).WithOne().HasForeignKey(x => x.LineId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(l => l.Lots).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class ProductionOrderLineLotConfiguration : IEntityTypeConfiguration<ProductionOrderLineLot>
{
    public void Configure(EntityTypeBuilder<ProductionOrderLineLot> builder)
    {
        builder.ToTable("production_order_line_lot", "production");
        builder.HasOne<Lot>().WithMany().HasForeignKey(x => x.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}
