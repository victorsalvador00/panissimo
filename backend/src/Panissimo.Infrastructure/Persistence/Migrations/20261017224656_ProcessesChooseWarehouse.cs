using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ProcessesChooseWarehouse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "from_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "to_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "location_id",
                schema: "production",
                table: "production_close_line",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "output_location_id",
                schema: "production",
                table: "production_close",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "location_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "location_id",
                schema: "sales",
                table: "customer_shipment_line",
                type: "uuid",
                nullable: true);

            // RN-45: documents registered before sub-warehouses moved stock in their own location.
            migrationBuilder.Sql("""
                UPDATE logistics.transfer_line l SET from_stock_location_id = t.from_location_id
                FROM logistics.transfer t WHERE l.transfer_id = t.id AND t.status <> 'Draft' AND t.status <> 'Cancelled';
                UPDATE logistics.transfer_line l SET to_stock_location_id = t.to_location_id
                FROM logistics.transfer t WHERE l.transfer_id = t.id AND l.received_qty IS NOT NULL;
                UPDATE production.production_close_line l SET location_id = o.location_id
                FROM production.production_close c JOIN production.production_order o ON o.id = c.production_order_id
                WHERE l.production_close_id = c.id;
                UPDATE production.production_close c SET output_location_id = o.location_id
                FROM production.production_order o WHERE o.id = c.production_order_id;
                UPDATE purchasing.goods_receipt_line l SET location_id = g.location_id
                FROM purchasing.goods_receipt g WHERE l.goods_receipt_id = g.id;
                UPDATE sales.customer_shipment_line l SET location_id = s.from_location_id
                FROM sales.customer_shipment s WHERE l.shipment_id = s.id AND s.status = 'Dispatched';
                """);

            migrationBuilder.CreateIndex(
                name: "ix_transfer_line_from_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                column: "from_stock_location_id");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_line_to_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                column: "to_stock_location_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_line_location_id",
                schema: "production",
                table: "production_close_line",
                column: "location_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_output_location_id",
                schema: "production",
                table: "production_close",
                column: "output_location_id");

            migrationBuilder.CreateIndex(
                name: "ix_goods_receipt_line_location_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "location_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_line_location_id",
                schema: "sales",
                table: "customer_shipment_line",
                column: "location_id");

            migrationBuilder.AddForeignKey(
                name: "fk_customer_shipment_line_locations_location_id",
                schema: "sales",
                table: "customer_shipment_line",
                column: "location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_goods_receipt_line_locations_location_id",
                schema: "purchasing",
                table: "goods_receipt_line",
                column: "location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_production_close_location_output_location_id",
                schema: "production",
                table: "production_close",
                column: "output_location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_production_close_line_location_location_id",
                schema: "production",
                table: "production_close_line",
                column: "location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_line_location_from_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                column: "from_stock_location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_line_location_to_stock_location_id",
                schema: "logistics",
                table: "transfer_line",
                column: "to_stock_location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_customer_shipment_line_locations_location_id",
                schema: "sales",
                table: "customer_shipment_line");

            migrationBuilder.DropForeignKey(
                name: "fk_goods_receipt_line_locations_location_id",
                schema: "purchasing",
                table: "goods_receipt_line");

            migrationBuilder.DropForeignKey(
                name: "fk_production_close_location_output_location_id",
                schema: "production",
                table: "production_close");

            migrationBuilder.DropForeignKey(
                name: "fk_production_close_line_location_location_id",
                schema: "production",
                table: "production_close_line");

            migrationBuilder.DropForeignKey(
                name: "fk_transfer_line_location_from_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropForeignKey(
                name: "fk_transfer_line_location_to_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropIndex(
                name: "ix_transfer_line_from_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropIndex(
                name: "ix_transfer_line_to_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropIndex(
                name: "ix_production_close_line_location_id",
                schema: "production",
                table: "production_close_line");

            migrationBuilder.DropIndex(
                name: "ix_production_close_output_location_id",
                schema: "production",
                table: "production_close");

            migrationBuilder.DropIndex(
                name: "ix_goods_receipt_line_location_id",
                schema: "purchasing",
                table: "goods_receipt_line");

            migrationBuilder.DropIndex(
                name: "ix_customer_shipment_line_location_id",
                schema: "sales",
                table: "customer_shipment_line");

            migrationBuilder.DropColumn(
                name: "from_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropColumn(
                name: "to_stock_location_id",
                schema: "logistics",
                table: "transfer_line");

            migrationBuilder.DropColumn(
                name: "location_id",
                schema: "production",
                table: "production_close_line");

            migrationBuilder.DropColumn(
                name: "output_location_id",
                schema: "production",
                table: "production_close");

            migrationBuilder.DropColumn(
                name: "location_id",
                schema: "purchasing",
                table: "goods_receipt_line");

            migrationBuilder.DropColumn(
                name: "location_id",
                schema: "sales",
                table: "customer_shipment_line");
        }
    }
}
