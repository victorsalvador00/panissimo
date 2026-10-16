using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "transfer",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    from_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    to_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    vehicle_description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    driver_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    dispatched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    dispatched_by = table.Column<Guid>(type: "uuid", nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    received_by = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_transfer", x => x.id);
                    table.ForeignKey(
                        name: "fk_transfer_locations_from_location_id",
                        column: x => x.from_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_transfer_locations_to_location_id",
                        column: x => x.to_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "transfer_line",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transfer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    shipped_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    received_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    discrepancy_reason = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    discrepancy_notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_transfer_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_transfer_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_transfer_line_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_transfer_line_transfers_transfer_id",
                        column: x => x.transfer_id,
                        principalSchema: "logistics",
                        principalTable: "transfer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transfer_branch_order_id",
                schema: "logistics",
                table: "transfer",
                column: "branch_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_folio",
                schema: "logistics",
                table: "transfer",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_transfer_from_location_id_status",
                schema: "logistics",
                table: "transfer",
                columns: new[] { "from_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_transfer_status",
                schema: "logistics",
                table: "transfer",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_to_location_id_status",
                schema: "logistics",
                table: "transfer",
                columns: new[] { "to_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_transfer_line_item_id",
                schema: "logistics",
                table: "transfer_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_line_lot_id",
                schema: "logistics",
                table: "transfer_line",
                column: "lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_line_transfer_id",
                schema: "logistics",
                table: "transfer_line",
                column: "transfer_id");

            // Decisión abierta 4: special transfer routes permission for roles seeded before it existed
            // (the administrator receives new permissions from the seed).
            migrationBuilder.Sql("""
                INSERT INTO security.role_permission (role_id, permission_code)
                SELECT id, 'logistics.transfers.special' FROM security.role
                WHERE system_key IN ('warehouse', 'operations_manager')
                ON CONFLICT DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transfer_line",
                schema: "logistics");

            migrationBuilder.DropTable(
                name: "transfer",
                schema: "logistics");
        }
    }
}
