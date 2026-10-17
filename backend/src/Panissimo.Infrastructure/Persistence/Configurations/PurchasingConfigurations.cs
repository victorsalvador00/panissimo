using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;
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

internal sealed class PurchaseRequisitionConfiguration : IEntityTypeConfiguration<PurchaseRequisition>
{
    public void Configure(EntityTypeBuilder<PurchaseRequisition> builder)
    {
        builder.ToTable("purchase_requisition", "purchasing");
        builder.Property(r => r.Folio).HasMaxLength(30);
        builder.Property(r => r.Status).HasMaxLength(20);
        builder.Property(r => r.Notes).HasMaxLength(PurchaseRequisition.NotesMaxLength);
        builder.Property(r => r.RejectionReason).HasMaxLength(500);
        builder.HasIndex(r => r.Folio).IsUnique();
        builder.HasIndex(r => r.Status);
        builder.HasIndex(r => new { r.LocationId, r.NeededBy });
        builder.HasOne<Location>().WithMany().HasForeignKey(r => r.LocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(r => r.Lines).WithOne().HasForeignKey(l => l.RequisitionId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(r => r.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class PurchaseRequisitionLineConfiguration : IEntityTypeConfiguration<PurchaseRequisitionLine>
{
    public void Configure(EntityTypeBuilder<PurchaseRequisitionLine> builder)
    {
        builder.ToTable("purchase_requisition_line", "purchasing");
        builder.HasIndex(l => l.ItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Supplier>().WithMany().HasForeignKey(l => l.SuggestedSupplierId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class PurchaseOrderConfiguration : IEntityTypeConfiguration<PurchaseOrder>
{
    public void Configure(EntityTypeBuilder<PurchaseOrder> builder)
    {
        builder.ToTable("purchase_order", "purchasing");
        builder.Property(o => o.Folio).HasMaxLength(30);
        builder.Property(o => o.Status).HasMaxLength(20);
        builder.Property(o => o.Notes).HasMaxLength(PurchaseOrder.NotesMaxLength);
        builder.Property(o => o.RejectionReason).HasMaxLength(500);
        builder.Property(o => o.Subtotal).HasPrecision(18, 2);
        builder.Property(o => o.TaxTotal).HasPrecision(18, 2);
        builder.Property(o => o.Total).HasPrecision(18, 2);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => o.Status);
        builder.HasIndex(o => new { o.SupplierId, o.Status });
        builder.HasIndex(o => new { o.DeliveryLocationId, o.ExpectedDate });
        builder.HasOne<Supplier>().WithMany().HasForeignKey(o => o.SupplierId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.DeliveryLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class PurchaseOrderLineConfiguration : IEntityTypeConfiguration<PurchaseOrderLine>
{
    public void Configure(EntityTypeBuilder<PurchaseOrderLine> builder)
    {
        builder.ToTable("purchase_order_line", "purchasing");
        builder.Property(l => l.TaxRate).HasPrecision(5, 4);
        builder.Property(l => l.Subtotal).HasPrecision(18, 2);
        builder.Property(l => l.TaxAmount).HasPrecision(18, 2);
        builder.HasIndex(l => l.ItemId);
        // RN-34: a requisition line becomes at most one PO line.
        builder.HasIndex(l => l.RequisitionLineId).IsUnique();
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PurchaseRequisitionLine>().WithMany().HasForeignKey(l => l.RequisitionLineId).OnDelete(DeleteBehavior.Restrict);
    }
}
