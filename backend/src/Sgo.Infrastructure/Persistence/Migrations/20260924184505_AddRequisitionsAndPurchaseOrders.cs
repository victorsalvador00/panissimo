using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRequisitionsAndPurchaseOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "purchase_order",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    supplier_id = table.Column<Guid>(type: "uuid", nullable: false),
                    delivery_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    expected_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    subtotal = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    tax_total = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    total = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    approved_by = table.Column<Guid>(type: "uuid", nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_purchase_order", x => x.id);
                    table.ForeignKey(
                        name: "fk_purchase_order_location_delivery_location_id",
                        column: x => x.delivery_location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_purchase_order_suppliers_supplier_id",
                        column: x => x.supplier_id,
                        principalSchema: "purchasing",
                        principalTable: "supplier",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "purchase_requisition",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    needed_by = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    submitted_by = table.Column<Guid>(type: "uuid", nullable: true),
                    approved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    approved_by = table.Column<Guid>(type: "uuid", nullable: true),
                    rejected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rejected_by = table.Column<Guid>(type: "uuid", nullable: true),
                    rejection_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    converted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    converted_by = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_purchase_requisition", x => x.id);
                    table.ForeignKey(
                        name: "fk_purchase_requisition_location_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "purchase_requisition_line",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    requisition_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    suggested_supplier_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_purchase_requisition_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_purchase_requisition_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_purchase_requisition_line_purchase_requisition_requisition_",
                        column: x => x.requisition_id,
                        principalSchema: "purchasing",
                        principalTable: "purchase_requisition",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_purchase_requisition_line_suppliers_suggested_supplier_id",
                        column: x => x.suggested_supplier_id,
                        principalSchema: "purchasing",
                        principalTable: "supplier",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "purchase_order_line",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    purchase_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    tax_rate = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: false),
                    received_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    requisition_line_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_purchase_order_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_purchase_order_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_purchase_order_line_purchase_orders_purchase_order_id",
                        column: x => x.purchase_order_id,
                        principalSchema: "purchasing",
                        principalTable: "purchase_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_purchase_order_line_purchase_requisition_line_requisition_l",
                        column: x => x.requisition_line_id,
                        principalSchema: "purchasing",
                        principalTable: "purchase_requisition_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_delivery_location_id_status",
                schema: "purchasing",
                table: "purchase_order",
                columns: new[] { "delivery_location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_folio",
                schema: "purchasing",
                table: "purchase_order",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_status",
                schema: "purchasing",
                table: "purchase_order",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_supplier_id_status",
                schema: "purchasing",
                table: "purchase_order",
                columns: new[] { "supplier_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_line_item_id",
                schema: "purchasing",
                table: "purchase_order_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_line_purchase_order_id",
                schema: "purchasing",
                table: "purchase_order_line",
                column: "purchase_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_order_line_requisition_line_id",
                schema: "purchasing",
                table: "purchase_order_line",
                column: "requisition_line_id");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_folio",
                schema: "purchasing",
                table: "purchase_requisition",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_location_id_status",
                schema: "purchasing",
                table: "purchase_requisition",
                columns: new[] { "location_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_status",
                schema: "purchasing",
                table: "purchase_requisition",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_line_item_id",
                schema: "purchasing",
                table: "purchase_requisition_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_line_requisition_id",
                schema: "purchasing",
                table: "purchase_requisition_line",
                column: "requisition_id");

            migrationBuilder.CreateIndex(
                name: "ix_purchase_requisition_line_suggested_supplier_id",
                schema: "purchasing",
                table: "purchase_requisition_line",
                column: "suggested_supplier_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "purchase_order_line",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "purchase_order",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "purchase_requisition_line",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "purchase_requisition",
                schema: "purchasing");
        }
    }
}
