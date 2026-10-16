using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Identity;

namespace Sgo.Infrastructure.Persistence.Configurations.Security;

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_token", "security");
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.Property(t => t.CreatedByIp).HasMaxLength(45);
        builder.Property(t => t.RevokedReason).HasMaxLength(30);
        // Two concurrent refreshes with the same token: only the first rotation wins.
        builder.Property(t => t.RevokedAt).IsConcurrencyToken();
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.FamilyId);
        builder.HasIndex(t => t.UserId);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
