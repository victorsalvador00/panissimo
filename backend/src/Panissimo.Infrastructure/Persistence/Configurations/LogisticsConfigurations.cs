using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class VehicleConfiguration : IEntityTypeConfiguration<Vehicle>
{
    public void Configure(EntityTypeBuilder<Vehicle> builder)
    {
        builder.ToTable("vehicle", "logistics");
        builder.Property(v => v.Plate).HasMaxLength(Vehicle.PlateMaxLength);
        builder.Property(v => v.Description).HasMaxLength(Vehicle.DescriptionMaxLength);
        builder.HasIndex(v => v.Plate).IsUnique();
        builder.Ignore(v => v.Label);
    }
}

internal sealed class DriverConfiguration : IEntityTypeConfiguration<Driver>
{
    public void Configure(EntityTypeBuilder<Driver> builder)
    {
        builder.ToTable("driver", "logistics");
        builder.Property(d => d.Name).HasMaxLength(Driver.NameMaxLength);
        builder.Property(d => d.Phone).HasMaxLength(Driver.PhoneMaxLength);
        builder.HasIndex(d => d.Name);
    }
}

internal sealed class TransferConfiguration : IEntityTypeConfiguration<Transfer>
{
    public void Configure(EntityTypeBuilder<Transfer> builder)
    {
        builder.ToTable("transfer", "logistics");
        builder.Property(t => t.Folio).HasMaxLength(30);
        builder.Property(t => t.Status).HasMaxLength(30);
        builder.Property(t => t.Kind).HasMaxLength(20);
        builder.Property(t => t.Notes).HasMaxLength(500);
        builder.HasIndex(t => new { t.Kind, t.Status });
        builder.Property(t => t.VehicleDescription).HasMaxLength(150);
        builder.Property(t => t.DriverName).HasMaxLength(150);
        builder.HasIndex(t => t.Folio).IsUnique();
        builder.HasIndex(t => t.Status);
        builder.HasIndex(t => new { t.FromLocationId, t.Status });
        builder.HasIndex(t => new { t.ToLocationId, t.Status });
        builder.HasIndex(t => t.BranchOrderId);
        builder.HasIndex(t => t.ProductionOrderId);
        builder.HasOne<Vehicle>().WithMany().HasForeignKey(t => t.VehicleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Driver>().WithMany().HasForeignKey(t => t.DriverId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ProductionOrder>().WithMany().HasForeignKey(t => t.ProductionOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(t => t.FromLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(t => t.ToLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<BranchOrder>().WithMany().HasForeignKey(t => t.BranchOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(t => t.Lines).WithOne().HasForeignKey(l => l.TransferId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(t => t.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class TransferLineConfiguration : IEntityTypeConfiguration<TransferLine>
{
    public void Configure(EntityTypeBuilder<TransferLine> builder)
    {
        builder.ToTable("transfer_line", "logistics");
        builder.HasOne<Location>().WithMany().HasForeignKey(l => l.FromStockLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(l => l.ToStockLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(l => l.DiscrepancyReason).HasMaxLength(20);
        builder.Property(l => l.DiscrepancyNotes).HasMaxLength(500);
        // RN-116: what the branch refused on receipt.
        builder.Property(l => l.RejectionReason).HasMaxLength(20);
        builder.Property(l => l.RejectionNotes).HasMaxLength(TransferLine.RejectionNotesMaxLength);
        builder.Property(l => l.RejectionDisposition).HasMaxLength(10);
        builder.Ignore(l => l.ShortQty);
        builder.Ignore(l => l.ReturnedQty);
        builder.Ignore(l => l.RejectedLossQty);
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
        builder.Property(o => o.Notes).HasMaxLength(BranchOrder.NotesMaxLength);
        builder.Property(o => o.RejectionReason).HasMaxLength(500);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => new { o.SupplyingLocationId, o.RequiredDate, o.Status });
        builder.HasIndex(o => new { o.RequestingLocationId, o.Status });
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
