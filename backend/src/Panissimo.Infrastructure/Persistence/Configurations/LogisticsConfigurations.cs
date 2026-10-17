using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;

namespace Panissimo.Infrastructure.Persistence.Configurations;

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
        builder.HasIndex(t => t.Folio).IsUnique();
        builder.HasIndex(t => t.Status);
        builder.HasIndex(t => new { t.FromLocationId, t.Status });
        builder.HasIndex(t => new { t.ToLocationId, t.Status });
        builder.HasIndex(t => t.BranchOrderId);
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
