using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGoodsReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "approval_required",
                schema: "purchasing",
                table: "purchase_order",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "closed_at",
                schema: "purchasing",
                table: "purchase_order",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "closed_by",
                schema: "purchasing",
                table: "purchase_order",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "rejected_at",
                schema: "purchasing",
                table: "purchase_order",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "rejected_by",
                schema: "purchasing",
                table: "purchase_order",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                schema: "purchasing",
                table: "purchase_order",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "submitted_at",
                schema: "purchasing",
                table: "purchase_order",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "submitted_by",
                schema: "purchasing",
                table: "purchase_order",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "goods_receipt",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    purchase_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    received_by = table.Column<Guid>(type: "uuid", nullable: true),
                    supplier_invoice_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_goods_receipt", x => x.id);
                    table.ForeignKey(
                        name: "fk_goods_receipt_location_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_goods_receipt_purchase_orders_purchase_order_id",
                        column: x => x.purchase_order_id,
                        principalSchema: "purchasing",
                        principalTable: "purchase_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "goods_receipt_line",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    goods_receipt_id = table.Column<Guid>(type: "uuid", nullable: false),
                    purchase_order_line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    base_quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost_base = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    lot_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    expiration_date = table.Column<DateOnly>(type: "date", nullable: true),
                    amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_goods_receipt_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_goods_receipt_line_goods_receipts_goods_receipt_id",
                        column: x => x.goods_receipt_id,
                        principalSchema: "purchasing",
                        principalTable: "goods_receipt",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_goods_receipt_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_goods_receipt_line_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_goods_receipt_line_purchase_order_line_purchase_order_line_",
                        column: x => x.purchase_order_line_id,
                        principalSchema: "purchasing",
                        principalTable: "purchase_order_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_folio",
                schema: "purchasing",
                table: "goods_receipt",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_location_id_received_at",
                schema: "purchasing",
                table: "goods_receipt",
                columns: new[] { "location_id", "received_at" });

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_purchase_order_id",
                schema: "purchasing",
                table: "goods_receipt",
                column: "purchase_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_line_goods_receipt_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "goods_receipt_id");

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_line_item_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_line_lot_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_line_purchase_order_line_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "purchase_order_line_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "goods_receipt_line",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "goods_receipt",
                schema: "purchasing");

            migrationBuilder.DropColumn(
                name: "approval_required",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "closed_at",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "closed_by",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "rejected_at",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "rejected_by",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "submitted_at",
                schema: "purchasing",
                table: "purchase_order");

            migrationBuilder.DropColumn(
                name: "submitted_by",
                schema: "purchasing",
                table: "purchase_order");
        }
    }
}
