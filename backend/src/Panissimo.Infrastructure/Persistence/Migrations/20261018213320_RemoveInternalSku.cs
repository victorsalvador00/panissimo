using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// D-07: the item keeps a single SKU. The internal SKU (Paníssimo's own code, already unique) becomes the SKU and its
    /// column is dropped; the previous system SKU is lost. The SKU index is rebuilt around the update so swapped values
    /// between items do not collide row by row.
    /// </summary>
    public partial class RemoveInternalSku : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_sku",
                schema: "catalog",
                table: "item");

            migrationBuilder.Sql("UPDATE catalog.item SET sku = internal_sku WHERE sku <> internal_sku;");

            migrationBuilder.CreateIndex(
                name: "ix_item_sku",
                schema: "catalog",
                table: "item",
                column: "sku",
                unique: true);

            migrationBuilder.DropIndex(
                name: "ix_item_internal_sku",
                schema: "catalog",
                table: "item");

            migrationBuilder.DropColumn(
                name: "internal_sku",
                schema: "catalog",
                table: "item");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "internal_sku",
                schema: "catalog",
                table: "item",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            // The previous system SKU cannot be recovered: both columns take the current SKU.
            migrationBuilder.Sql("UPDATE catalog.item SET internal_sku = sku;");

            migrationBuilder.AlterColumn<string>(
                name: "internal_sku",
                schema: "catalog",
                table: "item",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_item_internal_sku",
                schema: "catalog",
                table: "item",
                column: "internal_sku",
                unique: true);
        }
    }
}
