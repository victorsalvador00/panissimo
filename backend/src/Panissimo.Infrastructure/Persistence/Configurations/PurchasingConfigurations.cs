using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class SupplierConfiguration : IEntityTypeConfiguration<Supplier>
{
    public void Configure(EntityTypeBuilder<Supplier> builder)
    {
        builder.ToTable("supplier", "purchasing");
        builder.Property(s => s.TaxId).HasMaxLength(13);
        builder.Property(s => s.Name).HasMaxLength(SupplierRules.NameMaxLength);
        builder.Property(s => s.ContactName).HasMaxLength(SupplierRules.ContactNameMaxLength);
        builder.Property(s => s.Phone).HasMaxLength(SupplierRules.PhoneMaxLength);
        builder.Property(s => s.Email).HasMaxLength(SupplierRules.EmailMaxLength);
        // RN-35: unique RFC except the generic ones, which many suppliers may share.
        builder.HasIndex(s => s.TaxId).IsUnique()
            .HasFilter($"tax_id NOT IN ('{TaxIdRules.GenericNational}', '{TaxIdRules.GenericForeign}')");
        builder.HasIndex(s => s.Name);
    }
}

internal sealed class SupplierItemConfiguration : IEntityTypeConfiguration<SupplierItem>
{
    public void Configure(EntityTypeBuilder<SupplierItem> builder)
    {
        builder.ToTable("supplier_item", "purchasing");
        builder.Property(i => i.SupplierSku).HasMaxLength(SupplierRules.SupplierSkuMaxLength);
        builder.HasIndex(i => new { i.SupplierId, i.ItemId }).IsUnique();
        // RN-35: one preferred supplier per item.
        builder.HasIndex(i => i.ItemId, "preferred").IsUnique().HasFilter("is_preferred").HasDatabaseName("ix_supplier_item_preferred");
        builder.HasIndex(i => i.ItemId);

        builder.HasOne<Supplier>().WithMany().HasForeignKey(i => i.SupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(i => i.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}
