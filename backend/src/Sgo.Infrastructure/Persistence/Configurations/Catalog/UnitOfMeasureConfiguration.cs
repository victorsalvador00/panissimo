using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Catalog;

namespace Sgo.Infrastructure.Persistence.Configurations.Catalog;

internal sealed class UnitOfMeasureConfiguration : IEntityTypeConfiguration<UnitOfMeasure>
{
    public void Configure(EntityTypeBuilder<UnitOfMeasure> builder)
    {
        builder.ToTable("unit_of_measure", "catalog");
        builder.Property(u => u.Code).HasMaxLength(20);
        builder.Property(u => u.Name).HasMaxLength(100);
        builder.Property(u => u.Kind).HasMaxLength(20);
        builder.HasIndex(u => u.Code).IsUnique();
    }
}
