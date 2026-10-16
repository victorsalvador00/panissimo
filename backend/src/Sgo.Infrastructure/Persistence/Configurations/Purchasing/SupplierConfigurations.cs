using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Purchasing;

namespace Sgo.Infrastructure.Persistence.Configurations.Purchasing;

internal sealed class SupplierConfiguration : IEntityTypeConfiguration<Supplier>
{
    public void Configure(EntityTypeBuilder<Supplier> builder)
    {
        builder.ToTable("supplier", "purchasing");
        builder.Property(s => s.TaxId).HasMaxLength(13);
        builder.Property(s => s.Name).HasMaxLength(200);
        builder.Property(s => s.ContactName).HasMaxLength(150);
        builder.Property(s => s.Phone).HasMaxLength(30);
        builder.Property(s => s.Email).HasMaxLength(254);
        // The SAT generic RFCs (general public / foreign) may repeat.
        builder.HasIndex(s => s.TaxId).IsUnique()
            .HasFilter($"tax_id NOT IN ({string.Join(", ", TaxIdRules.GenericTaxIds.Order().Select(t => $"'{t}'"))})");
        builder.HasIndex(s => s.Name);
    }
}

internal sealed class SupplierItemConfiguration : IEntityTypeConfiguration<SupplierItem>
{
    public void Configure(EntityTypeBuilder<SupplierItem> builder)
    {
        builder.ToTable("supplier_item", "purchasing");
        builder.Property(i => i.SupplierSku).HasMaxLength(50);
        builder.HasIndex(i => new { i.SupplierId, i.ItemId }).IsUnique();
        // One preferred supplier per item (suggested supplier for requisitions).
        builder.HasIndex(i => i.ItemId, "ux_supplier_item_one_preferred_per_item").IsUnique().HasFilter("is_preferred")
            .HasDatabaseName("ux_supplier_item_one_preferred_per_item");
        builder.HasIndex(i => i.ItemId, "ix_supplier_item_item_id").HasDatabaseName("ix_supplier_item_item_id");
        builder.HasOne<Supplier>().WithMany().HasForeignKey(i => i.SupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(i => i.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}
