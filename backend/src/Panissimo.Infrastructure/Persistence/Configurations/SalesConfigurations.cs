using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;

namespace Panissimo.Infrastructure.Persistence.Configurations;

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customer", "sales");
        builder.Property(c => c.Code).HasMaxLength(CustomerRules.CodeMaxLength);
        builder.Property(c => c.Name).HasMaxLength(CustomerRules.NameMaxLength);
        builder.Property(c => c.TaxId).HasMaxLength(13);
        builder.Property(c => c.ContactName).HasMaxLength(CustomerRules.ContactNameMaxLength);
        builder.Property(c => c.Phone).HasMaxLength(CustomerRules.PhoneMaxLength);
        builder.Property(c => c.Email).HasMaxLength(CustomerRules.EmailMaxLength);
        builder.Property(c => c.Notes).HasMaxLength(CustomerRules.NotesMaxLength);
        builder.HasIndex(c => c.Code).IsUnique();
        builder.HasIndex(c => c.Name);
        // Same rule as suppliers (RN-35): unique RFC except the generic ones; optional here.
        builder.HasIndex(c => c.TaxId).IsUnique()
            .HasFilter($"tax_id IS NOT NULL AND tax_id NOT IN ('{TaxIdRules.GenericNational}', '{TaxIdRules.GenericForeign}')");
    }
}

internal sealed class CustomerDeliveryPointConfiguration : IEntityTypeConfiguration<CustomerDeliveryPoint>
{
    public void Configure(EntityTypeBuilder<CustomerDeliveryPoint> builder)
    {
        builder.ToTable("customer_delivery_point", "sales");
        builder.Property(p => p.Name).HasMaxLength(CustomerRules.DeliveryPointNameMaxLength);
        builder.Property(p => p.Address).HasMaxLength(CustomerRules.AddressMaxLength);
        builder.HasIndex(p => p.CustomerId);
        builder.HasOne<Customer>().WithMany().HasForeignKey(p => p.CustomerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CustomerItemConfiguration : IEntityTypeConfiguration<CustomerItem>
{
    public void Configure(EntityTypeBuilder<CustomerItem> builder)
    {
        builder.ToTable("customer_item", "sales");
        builder.Property(i => i.CustomerSku).HasMaxLength(CustomerRules.CustomerSkuMaxLength);
        builder.HasIndex(i => new { i.CustomerId, i.ItemId }).IsUnique();
        builder.HasIndex(i => i.ItemId);
        builder.HasOne<Customer>().WithMany().HasForeignKey(i => i.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(i => i.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CustomerOrderConfiguration : IEntityTypeConfiguration<CustomerOrder>
{
    public void Configure(EntityTypeBuilder<CustomerOrder> builder)
    {
        builder.ToTable("customer_order", "sales");
        builder.Property(o => o.Folio).HasMaxLength(30);
        builder.Property(o => o.Status).HasMaxLength(30);
        builder.Property(o => o.CustomerReference).HasMaxLength(CustomerOrder.ReferenceMaxLength);
        builder.Property(o => o.Notes).HasMaxLength(CustomerOrder.NotesMaxLength);
        builder.Property(o => o.CloseReason).HasMaxLength(500);
        builder.HasIndex(o => o.Folio).IsUnique();
        builder.HasIndex(o => new { o.SupplyingLocationId, o.RequiredDate, o.Status });
        builder.HasIndex(o => new { o.CustomerId, o.Status });
        builder.HasOne<Customer>().WithMany().HasForeignKey(o => o.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<CustomerDeliveryPoint>().WithMany().HasForeignKey(o => o.DeliveryPointId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(o => o.SupplyingLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(o => o.Lines).WithOne().HasForeignKey(l => l.CustomerOrderId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class CustomerOrderLineConfiguration : IEntityTypeConfiguration<CustomerOrderLine>
{
    public void Configure(EntityTypeBuilder<CustomerOrderLine> builder)
    {
        builder.ToTable("customer_order_line", "sales");
        builder.Ignore(l => l.PendingQty);
        builder.HasIndex(l => l.ItemId);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CustomerShipmentConfiguration : IEntityTypeConfiguration<CustomerShipment>
{
    public void Configure(EntityTypeBuilder<CustomerShipment> builder)
    {
        builder.ToTable("customer_shipment", "sales");
        builder.Property(s => s.Folio).HasMaxLength(30);
        builder.Property(s => s.Status).HasMaxLength(20);
        builder.Property(s => s.Notes).HasMaxLength(CustomerShipment.NotesMaxLength);
        builder.Property(s => s.VehicleDescription).HasMaxLength(150);
        builder.Property(s => s.DriverName).HasMaxLength(150);
        builder.Property(s => s.ReceivedByName).HasMaxLength(150);
        builder.HasIndex(s => s.Folio).IsUnique();
        builder.HasIndex(s => s.Status);
        builder.HasIndex(s => s.CustomerOrderId);
        builder.HasIndex(s => new { s.FromLocationId, s.Status });
        builder.HasIndex(s => s.CustomerId);
        builder.HasOne<CustomerOrder>().WithMany().HasForeignKey(s => s.CustomerOrderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Customer>().WithMany().HasForeignKey(s => s.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<CustomerDeliveryPoint>().WithMany().HasForeignKey(s => s.DeliveryPointId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Location>().WithMany().HasForeignKey(s => s.FromLocationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(s => s.Lines).WithOne().HasForeignKey(l => l.ShipmentId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(s => s.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class CustomerShipmentLineConfiguration : IEntityTypeConfiguration<CustomerShipmentLine>
{
    public void Configure(EntityTypeBuilder<CustomerShipmentLine> builder)
    {
        builder.ToTable("customer_shipment_line", "sales");
        builder.HasIndex(l => l.CustomerOrderLineId);
        builder.HasIndex(l => l.ItemId);
        builder.HasOne<CustomerOrderLine>().WithMany().HasForeignKey(l => l.CustomerOrderLineId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Item>().WithMany().HasForeignKey(l => l.ItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(l => l.Lots).WithOne().HasForeignKey(x => x.LineId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(l => l.Lots).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

internal sealed class CustomerShipmentLineLotConfiguration : IEntityTypeConfiguration<CustomerShipmentLineLot>
{
    public void Configure(EntityTypeBuilder<CustomerShipmentLineLot> builder)
    {
        builder.ToTable("customer_shipment_line_lot", "sales");
        builder.HasIndex(x => x.LotId);
        builder.HasOne<Lot>().WithMany().HasForeignKey(x => x.LotId).OnDelete(DeleteBehavior.Restrict);
    }
}
