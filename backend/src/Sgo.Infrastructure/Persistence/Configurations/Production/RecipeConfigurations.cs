using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;
using Sgo.Domain.Production;

namespace Sgo.Infrastructure.Persistence.Configurations.Production;

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
