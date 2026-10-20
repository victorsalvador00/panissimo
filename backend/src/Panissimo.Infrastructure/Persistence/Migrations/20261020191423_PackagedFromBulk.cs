using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PackagedFromBulk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // RN-119: the plant's finished-goods sub-warehouse supplies the bulk goods that packaged recipes consume (RN-111),
            // unless another sub-warehouse of that plant already does.
            migrationBuilder.Sql("""
                UPDATE org.location w SET supplies_types = array_append(w.supplies_types, 'FinishedGood')
                FROM org.location p
                WHERE w.parent_location_id = p.id AND p.type = 'Plant' AND w.type = 'Warehouse' AND w.code = p.code || '-PT'
                  AND NOT EXISTS (SELECT 1 FROM org.location o
                                  WHERE o.parent_location_id = p.id AND 'FinishedGood' = ANY (o.supplies_types));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE org.location SET supplies_types = array_remove(supplies_types, 'FinishedGood');");
        }
    }
}
