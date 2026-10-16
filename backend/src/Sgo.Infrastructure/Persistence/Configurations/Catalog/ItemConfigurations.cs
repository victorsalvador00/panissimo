using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Organization;

namespace Sgo.Infrastructure.Persistence.Configurations.Catalog;

internal sealed class ItemCategoryConfiguration : IEntityTypeConfiguration<ItemCategory>
{
    public void Configure(EntityTypeBuilder<ItemCategory> builder)
    {
        builder.ToTable("item_category", "catalog");
        builder.Property(c => c.Name).HasMaxLength(100);
        // Case-insensitive uniqueness ("Secos" = "secos") is checked by the service.
        builder.HasIndex(c => c.Name).IsUnique();
    }
}

internal sealed class ItemConfiguration : IEntityTypeConfiguration<Item>
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.ToTable("item", "catalog");
        builder.Property(i => i.Sku).HasMaxLength(ItemRules.SkuMaxLength);
        builder.Property(i => i.Name).HasMaxLength(ItemRules.NameMaxLength);
        builder.Property(i => i.Type).HasMaxLength(20);
        builder.Property(i => i.StorageCondition).HasMaxLength(20);
        builder.Property(i => i.TaxRate).HasPrecision(5, 4);
        builder.HasIndex(i => i.Sku).IsUnique();
        builder.HasIndex(i => i.Name);
        builder.HasIndex(i => i.CategoryId);

        builder.HasOne<ItemCategory>().WithMany().HasForeignKey(i => i.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UnitOfMeasure>().WithMany().HasForeignKey(i => i.BaseUomId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UnitOfMeasure>().WithMany().HasForeignKey(i => i.PurchaseUomId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ItemLocationSettingConfiguration : IEntityTypeConfiguration<ItemLocationSetting>
{
    public void Configure(EntityTypeBuilder<ItemLocationSetting> builder)
    {
        builder.ToTable("item_location_setting", "catalog");
        builder.HasKey(s => new { s.ItemId, s.LocationId });
        builder.HasIndex(s => s.LocationId);
        builder.HasOne<Item>().WithMany().HasForeignKey(s => s.ItemId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Location>().WithMany().HasForeignKey(s => s.LocationId).OnDelete(DeleteBehavior.Restrict);
    }
}
