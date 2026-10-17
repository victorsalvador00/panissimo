using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInternalTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "internal_transfer_folio_seq",
                schema: "inventory");

            migrationBuilder.AddColumn<string>(
                name: "kind",
                schema: "logistics",
                table: "transfer",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Standard"); // existing transfers are plant/branch transfers

            migrationBuilder.CreateIndex(
                name: "ix_transfer_kind_status",
                schema: "logistics",
                table: "transfer",
                columns: new[] { "kind", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_transfer_kind_status",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropColumn(
                name: "kind",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropSequence(
                name: "internal_transfer_folio_seq",
                schema: "inventory");
        }
    }
}
