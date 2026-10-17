using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameMatrixCodeToInternalCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_matrix_code",
                schema: "catalog",
                table: "item");

            migrationBuilder.RenameColumn(
                name: "matrix_code",
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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_item_internal_code",
                schema: "catalog",
                table: "item");

            migrationBuilder.RenameColumn(
                name: "internal_code",
                schema: "catalog",
                table: "item",
                newName: "matrix_code");

            migrationBuilder.CreateIndex(
                name: "ix_item_matrix_code",
                schema: "catalog",
                table: "item",
                column: "matrix_code",
                unique: true,
                filter: "matrix_code IS NOT NULL");
        }
    }
}
