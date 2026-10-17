using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// D-07: the internal code becomes the required, unique internal SKU. Renamed in place (no data loss); items without
    /// one take their system SKU, which is already unique.
    /// </summary>
    public partial class RequireInternalSku : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_internal_code",
                schema: "catalog",
                table: "item");

            migrationBuilder.RenameColumn(
                name: "internal_code",
                schema: "catalog",
                table: "item",
                newName: "internal_sku");

            migrationBuilder.Sql("UPDATE catalog.item SET internal_sku = sku WHERE internal_sku IS NULL;");

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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_internal_sku",
                schema: "catalog",
                table: "item");

            migrationBuilder.AlterColumn<string>(
                name: "internal_sku",
                schema: "catalog",
                table: "item",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.RenameColumn(
                name: "internal_sku",
                schema: "catalog",
                table: "item",
                newName: "internal_code");

            migrationBuilder.CreateIndex(
                name: "ix_item_internal_code",
                schema: "catalog",
                table: "item",
                column: "internal_code",
                unique: true,
                filter: "internal_code IS NOT NULL");
        }
    }
}
