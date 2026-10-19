using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// RN-114: delivery of a shipment (when, by whom) and what the customer rejected per lot; the status column grows for
    /// DeliveredWithDiscrepancies.
    /// </summary>
    public partial class AddShipmentDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "status",
                schema: "sales",
                table: "customer_shipment",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "delivered_at",
                schema: "sales",
                table: "customer_shipment",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "delivered_by",
                schema: "sales",
                table: "customer_shipment",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "customer_shipment_rejection",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    shipment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    reason = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    disposition = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    return_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    return_adjustment_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_shipment_rejection", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_shipment_rejection_customer_shipment_line_line_id",
                        column: x => x.line_id,
                        principalSchema: "sales",
                        principalTable: "customer_shipment_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_rejection_customer_shipment_shipment_id",
                        column: x => x.shipment_id,
                        principalSchema: "sales",
                        principalTable: "customer_shipment",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_customer_shipment_rejection_inventory_adjustments_return_ad",
                        column: x => x.return_adjustment_id,
                        principalSchema: "inventory",
                        principalTable: "adjustment",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_rejection_locations_return_location_id",
                        column: x => x.return_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_rejection_lots_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_rejection_line_id",
                schema: "sales",
                table: "customer_shipment_rejection",
                column: "line_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_rejection_lot_id",
                schema: "sales",
                table: "customer_shipment_rejection",
                column: "lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_rejection_return_adjustment_id",
                schema: "sales",
                table: "customer_shipment_rejection",
                column: "return_adjustment_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_rejection_return_location_id",
                schema: "sales",
                table: "customer_shipment_rejection",
                column: "return_location_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_rejection_shipment_id",
                schema: "sales",
                table: "customer_shipment_rejection",
                column: "shipment_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_shipment_rejection",
                schema: "sales");

            migrationBuilder.DropColumn(
                name: "delivered_at",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropColumn(
                name: "delivered_by",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.AlterColumn<string>(
                name: "status",
                schema: "sales",
                table: "customer_shipment",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30);
        }
    }
}
