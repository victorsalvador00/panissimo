using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// RN-50a..c: origin per order line, stock reservations, the voucher's order and the item types each sub-warehouse
    /// supplies by default. The Planta's seeded sub-warehouses take their natural types.
    /// </summary>
    public partial class AddProductionSupply : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "production_order_id",
                schema: "logistics",
                table: "transfer",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_location_id",
                schema: "production",
                table: "production_order_line",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "supplies_types",
                schema: "org",
                table: "location",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.CreateTable(
                name: "stock_reservation",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    production_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    transfer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_stock_reservation", x => x.id);
                    table.ForeignKey(
                        name: "fk_stock_reservation_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_stock_reservation_location_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_stock_reservation_production_order_production_order_id",
                        column: x => x.production_order_id,
                        principalSchema: "production",
                        principalTable: "production_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_stock_reservation_transfers_transfer_id",
                        column: x => x.transfer_id,
                        principalSchema: "logistics",
                        principalTable: "transfer",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transfer_production_order_id",
                schema: "logistics",
                table: "transfer",
                column: "production_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_source_location_id",
                schema: "production",
                table: "production_order_line",
                column: "source_location_id");

            migrationBuilder.CreateIndex(
                name: "ix_stock_reservation_item_id",
                schema: "inventory",
                table: "stock_reservation",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_stock_reservation_location_id_item_id",
                schema: "inventory",
                table: "stock_reservation",
                columns: new[] { "location_id", "item_id" });

            migrationBuilder.CreateIndex(
                name: "ix_stock_reservation_production_order_id",
                schema: "inventory",
                table: "stock_reservation",
                column: "production_order_id");

            migrationBuilder.CreateIndex(
                name: "ix_stock_reservation_transfer_id",
                schema: "inventory",
                table: "stock_reservation",
                column: "transfer_id");

            migrationBuilder.AddForeignKey(
                name: "fk_production_order_line_location_source_location_id",
                schema: "production",
                table: "production_order_line",
                column: "source_location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_production_order_production_order_id",
                schema: "logistics",
                table: "transfer",
                column: "production_order_id",
                principalSchema: "production",
                principalTable: "production_order",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql("""
                UPDATE org.location w SET supplies_types = CASE w.code
                        WHEN p.code || '-MP' THEN ARRAY['RawMaterial']
                        WHEN p.code || '-INS' THEN ARRAY['Supply']
                        WHEN p.code || '-SEMI' THEN ARRAY['SemiFinished'] END
                FROM org.location p
                WHERE w.parent_location_id = p.id AND p.code = 'PLANTA' AND w.type = 'Warehouse'
                  AND w.code IN (p.code || '-MP', p.code || '-INS', p.code || '-SEMI');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_production_order_line_location_source_location_id",
                schema: "production",
                table: "production_order_line");

            migrationBuilder.DropForeignKey(
                name: "fk_transfer_production_order_production_order_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropTable(
                name: "stock_reservation",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "ix_transfer_production_order_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropIndex(
                name: "ix_production_order_line_source_location_id",
                schema: "production",
                table: "production_order_line");

            migrationBuilder.DropColumn(
                name: "production_order_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropColumn(
                name: "source_location_id",
                schema: "production",
                table: "production_order_line");

            migrationBuilder.DropColumn(
                name: "supplies_types",
                schema: "org",
                table: "location");
        }
    }
}
