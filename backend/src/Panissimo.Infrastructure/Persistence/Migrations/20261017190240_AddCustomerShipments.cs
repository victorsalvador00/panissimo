using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerShipments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "customer_shipment",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    customer_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    delivery_point_id = table.Column<Guid>(type: "uuid", nullable: true),
                    from_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    vehicle_description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    driver_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    received_by_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    dispatched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    dispatched_by = table.Column<Guid>(type: "uuid", nullable: true),
                    cancelled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_shipment", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_shipment_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "sales",
                        principalTable: "customer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_customer_delivery_point_delivery_point_id",
                        column: x => x.delivery_point_id,
                        principalSchema: "sales",
                        principalTable: "customer_delivery_point",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_customer_order_customer_order_id",
                        column: x => x.customer_order_id,
                        principalSchema: "sales",
                        principalTable: "customer_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_locations_from_location_id",
                        column: x => x.from_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_shipment_line",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    shipment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_order_line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_shipment_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_shipment_line_customer_order_line_customer_order_l",
                        column: x => x.customer_order_line_id,
                        principalSchema: "sales",
                        principalTable: "customer_order_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_shipment_line_customer_shipment_shipment_id",
                        column: x => x.shipment_id,
                        principalSchema: "sales",
                        principalTable: "customer_shipment",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_customer_shipment_line_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_shipment_line_lot",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_shipment_line_lot", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_shipment_line_lot_customer_shipment_line_line_id",
                        column: x => x.line_id,
                        principalSchema: "sales",
                        principalTable: "customer_shipment_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_customer_shipment_line_lot_lots_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_customer_id",
                schema: "sales",
                table: "customer_shipment",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_customer_order_id",
                schema: "sales",
                table: "customer_shipment",
                column: "customer_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_delivery_point_id",
                schema: "sales",
                table: "customer_shipment",
                column: "delivery_point_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_folio",
                schema: "sales",
                table: "customer_shipment",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_from_location_id_status",
                schema: "sales",
                table: "customer_shipment",
                columns: new[] { "from_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_status",
                schema: "sales",
                table: "customer_shipment",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_customer_order_line_id",
                schema: "sales",
                table: "customer_shipment_line",
                column: "customer_order_line_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_item_id",
                schema: "sales",
                table: "customer_shipment_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_shipment_id",
                schema: "sales",
                table: "customer_shipment_line",
                column: "shipment_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_lot_line_id",
                schema: "sales",
                table: "customer_shipment_line_lot",
                column: "line_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_lot_lot_id",
                schema: "sales",
                table: "customer_shipment_line_lot",
                column: "lot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_shipment_line_lot",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer_shipment_line",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer_shipment",
                schema: "sales");
        }
    }
}
