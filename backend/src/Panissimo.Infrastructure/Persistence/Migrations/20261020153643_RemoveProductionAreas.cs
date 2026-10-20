using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveProductionAreas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The permission left the catalog with the areas.
            migrationBuilder.Sql("""
                DELETE FROM security.role_permission WHERE permission_code = 'production.areas.manage';
                DELETE FROM security.known_permission WHERE code = 'production.areas.manage';
                """);

            migrationBuilder.DropForeignKey(
                name: "fk_item_production_areas_production_area_id",
                schema: "catalog",
                table: "item");

            migrationBuilder.DropForeignKey(
                name: "fk_production_order_production_area_production_area_id",
                schema: "production",
                table: "production_order");

            migrationBuilder.DropTable(
                name: "production_area",
                schema: "production");

            migrationBuilder.DropIndex(
                name: "ix_production_order_production_area_id",
                schema: "production",
                table: "production_order");

            migrationBuilder.DropIndex(
                name: "ix_item_production_area_id",
                schema: "catalog",
                table: "item");

            migrationBuilder.DropColumn(
                name: "production_area_id",
                schema: "production",
                table: "production_order");

            migrationBuilder.DropColumn(
                name: "production_area_id",
                schema: "catalog",
                table: "item");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "production_area_id",
                schema: "production",
                table: "production_order",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "production_area_id",
                schema: "catalog",
                table: "item",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "production_area",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_area", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_production_area_id",
                schema: "production",
                table: "production_order",
                column: "production_area_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_production_area_id",
                schema: "catalog",
                table: "item",
                column: "production_area_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_area_code",
                schema: "production",
                table: "production_area",
                column: "code",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_item_production_areas_production_area_id",
                schema: "catalog",
                table: "item",
                column: "production_area_id",
                principalSchema: "production",
                principalTable: "production_area",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_production_order_production_area_production_area_id",
                schema: "production",
                table: "production_order",
                column: "production_area_id",
                principalSchema: "production",
                principalTable: "production_area",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
