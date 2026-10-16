using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Logistics;
using Sgo.Domain.Organization;

namespace Sgo.Infrastructure.Persistence.Configurations.Logistics;

internal sealed class TransferConfiguration : IEntityTypeConfiguration<Transfer>
{
    public void Configure(EntityTypeBuilder<Transfer> builder)
    {
        builder.ToTable("transfer", "logistics");
        builder.Property(t => t.Folio).HasMaxLength(30);
        builder.Property(t => t.Status).HasMaxLength(30);
        builder.Property(t => t.Notes).HasMaxLength(500);
        builder.Property(t => t.VehicleDescription).HasMaxLength(150);
        builder.Property(t => t.DriverName).HasMaxLength(150);
        builder.Ignore(t => t.IsInTransit);
        builder.HasIndex(t => t.Folio).IsUnique();
        builder.HasIndex(t => t.Status);
        builder.HasIndex(t => new { t.FromLocationId, t.Status });
        builder.HasIndex(t => new { t.ToLocationId, t.Status });
        builder.HasIndex(t => t.BranchOrderId);
        builder.HasOne<BranchOrder>().WithMany().HasForeignKey(t => t.BranchOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(t => t.FromLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(t => t.ToLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(t => t.Lines).WithOne().HasForeignKey(l => l.TransferId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class TransferLineConfiguration : IEntityTypeConfiguration<TransferLine>
{
    public void Configure(EntityTypeBuilder<TransferLine> builder)
    {
        builder.ToTable("transfer_line", "logistics");
        builder.Property(l => l.DiscrepancyReason).HasMaxLength(20);
        builder.Property(l => l.DiscrepancyNotes).HasMaxLength(500);
        builder.Ignore(l => l.ShortQty);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Lot>().WithMany().HasForeignKey(l => l.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class BranchOrderConfiguration : IEntityTypeConfiguration<BranchOrder>
{
    public void Configure(EntityTypeBuilder<BranchOrder> builder)
    {
        builder.ToTable("branch_order", "logistics");
        builder.Property(o => o.Folio).HasMaxLength(30);
        builder.Property(o => o.Status).HasMaxLength(30);
        builder.Property(o => o.Notes).HasMaxLength(500);
        builder.Property(o => o.RejectionReason).HasMaxLength(500);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => new { o.RequestingLocationId, o.Status });
        builder.HasIndex(o => new { o.SupplyingLocationId, o.Status });
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.RequestingLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.SupplyingLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.BranchOrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class BranchOrderLineConfiguration : IEntityTypeConfiguration<BranchOrderLine>
{
    public void Configure(EntityTypeBuilder<BranchOrderLine> builder)
    {
        builder.ToTable("branch_order_line", "logistics");
        builder.HasIndex(l => l.ItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}
