using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TuneKardexIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "location_id", "item_id", "sequence" })
                .Annotation("Npgsql:IndexInclude", new[] { "quantity" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_location_id_sequence",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "location_id", "sequence" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_location_id_sequence",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "location_id", "item_id", "sequence" });
        }
    }
}
