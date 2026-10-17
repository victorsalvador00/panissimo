using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomersAndCustomerOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "customer",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    tax_id = table.Column<string>(type: "character varying(13)", maxLength: 13, nullable: true),
                    contact_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    email = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "customer_delivery_point",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_delivery_point", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_delivery_point_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "sales",
                        principalTable: "customer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_item",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_sku = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_item", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_item_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "sales",
                        principalTable: "customer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_item_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_order",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    delivery_point_id = table.Column<Guid>(type: "uuid", nullable: true),
                    supplying_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    required_date = table.Column<DateOnly>(type: "date", nullable: false),
                    customer_reference = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    cancelled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    closed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    close_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_order", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_order_customer_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "sales",
                        principalTable: "customer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_order_customer_delivery_point_delivery_point_id",
                        column: x => x.delivery_point_id,
                        principalSchema: "sales",
                        principalTable: "customer_delivery_point",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_customer_order_locations_supplying_location_id",
                        column: x => x.supplying_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customer_order_line",
                schema: "sales",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    customer_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    line_number = table.Column<int>(type: "integer", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    shipped_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_order_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_order_line_customer_orders_customer_order_id",
                        column: x => x.customer_order_id,
                        principalSchema: "sales",
                        principalTable: "customer_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_customer_order_line_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_customer_code",
                schema: "sales",
                table: "customer",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customer_name",
                schema: "sales",
                table: "customer",
                column: "name");

            migrationBuilder.CreateIndex(
                name: "ix_customer_tax_id",
                schema: "sales",
                table: "customer",
                column: "tax_id",
                unique: true,
                filter: "tax_id IS NOT NULL AND tax_id NOT IN ('XAXX010101000', 'XEXX010101000')");

            migrationBuilder.CreateIndex(
                name: "ix_customer_delivery_point_customer_id",
                schema: "sales",
                table: "customer_delivery_point",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_item_customer_id_item_id",
                schema: "sales",
                table: "customer_item",
                columns: new[] { "customer_id", "item_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customer_item_item_id",
                schema: "sales",
                table: "customer_item",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_customer_id_status",
                schema: "sales",
                table: "customer_order",
                columns: new[] { "customer_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_delivery_point_id",
                schema: "sales",
                table: "customer_order",
                column: "delivery_point_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_folio",
                schema: "sales",
                table: "customer_order",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_supplying_location_id_required_date_status",
                schema: "sales",
                table: "customer_order",
                columns: new[] { "supplying_location_id", "required_date", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_line_customer_order_id",
                schema: "sales",
                table: "customer_order_line",
                column: "customer_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_order_line_item_id",
                schema: "sales",
                table: "customer_order_line",
                column: "item_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_item",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer_order_line",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer_order",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer_delivery_point",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "customer",
                schema: "sales");
        }
    }
}
