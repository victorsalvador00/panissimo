using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransferRejections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "rejected_qty",
                schema: "logistics",
                table: "transfer_line",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "rejection_disposition",
                schema: "logistics",
                table: "transfer_line",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_notes",
                schema: "logistics",
                table: "transfer_line",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                schema: "logistics",
                table: "transfer_line",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "rejected_qty",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropColumn(
                name: "rejection_disposition",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropColumn(
                name: "rejection_notes",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                schema: "logistics",
                table: "transfer_line");
        }
    }
}
