using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "branch_order",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    requesting_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    supplying_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    required_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    submitted_by = table.Column<Guid>(type: "uuid", nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    approved_by = table.Column<Guid>(type: "uuid", nullable: true),
                    rejected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rejected_by = table.Column<Guid>(type: "uuid", nullable: true),
                    rejection_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    fulfilled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_branch_order", x => x.id);
                    table.ForeignKey(
                        name: "fk_branch_order_locations_requesting_location_id",
                        column: x => x.requesting_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_branch_order_locations_supplying_location_id",
                        column: x => x.supplying_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "branch_order_line",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    approved_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    shipped_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_branch_order_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_branch_order_line_branch_orders_branch_order_id",
                        column: x => x.branch_order_id,
                        principalSchema: "logistics",
                        principalTable: "branch_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_branch_order_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_branch_order_folio",
                schema: "logistics",
                table: "branch_order",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_branch_order_requesting_location_id_status",
                schema: "logistics",
                table: "branch_order",
                columns: new[] { "requesting_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_branch_order_supplying_location_id_status",
                schema: "logistics",
                table: "branch_order",
                columns: new[] { "supplying_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_branch_order_line_branch_order_id",
                schema: "logistics",
                table: "branch_order_line",
                column: "branch_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_branch_order_line_item_id",
                schema: "logistics",
                table: "branch_order_line",
                column: "item_id");

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_branch_order_branch_order_id",
                schema: "logistics",
                table: "transfer",
                column: "branch_order_id",
                principalSchema: "logistics",
                principalTable: "branch_order",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_transfer_branch_order_branch_order_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropTable(
                name: "branch_order_line",
                schema: "logistics");

            migrationBuilder.DropTable(
                name: "branch_order",
                schema: "logistics");
        }
    }
}
