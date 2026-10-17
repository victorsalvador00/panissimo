using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ApplyClientDecisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "notes",
                schema: "purchasing",
                table: "purchase_requisition_line",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "close_reason",
                schema: "purchasing",
                table: "purchase_order",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "exceeds_tolerance",
                schema: "production",
                table: "production_close",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "matrix_code",
                schema: "catalog",
                table: "item",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "waste_qty",
                schema: "inventory",
                table: "adjustment_line",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "waste_reason",
                schema: "inventory",
                table: "adjustment_line",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_item_matrix_code",
                schema: "catalog",
                table: "item",
                column: "matrix_code",
                unique: true,
                filter: "matrix_code IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_matrix_code",
                schema: "catalog",
                table: "item");

            migrationBuilder.DropColumn(
                name: "notes",
                schema: "purchasing",
                table: "purchase_requisition_line");

            migrationBuilder.DropColumn(
                name: "close_reason",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "exceeds_tolerance",
                schema: "production",
                table: "production_close");

            migrationBuilder.DropColumn(
                name: "matrix_code",
                schema: "catalog",
                table: "item");

            migrationBuilder.DropColumn(
                name: "waste_qty",
                schema: "inventory",
                table: "adjustment_line");

            migrationBuilder.DropColumn(
                name: "waste_reason",
                schema: "inventory",
                table: "adjustment_line");
        }
    }
}
