using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductionCloses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "production_close",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    production_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    shift = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    produced_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    output_lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    total_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    closed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_close", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_close_lot_output_lot_id",
                        column: x => x.output_lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_close_production_orders_production_order_id",
                        column: x => x.production_order_id,
                        principalSchema: "production",
                        principalTable: "production_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "production_close_line",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    production_close_id = table.Column<Guid>(type: "uuid", nullable: false),
                    component_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    theoretical_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    actual_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    waste_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_close_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_close_line_item_component_item_id",
                        column: x => x.component_item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_close_line_production_closes_production_close_id",
                        column: x => x.production_close_id,
                        principalSchema: "production",
                        principalTable: "production_close",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "production_close_line_lot",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_close_line_lot", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_close_line_lot_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_close_line_lot_production_close_line_line_id",
                        column: x => x.line_id,
                        principalSchema: "production",
                        principalTable: "production_close_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_production_close_business_date",
                schema: "production",
                table: "production_close",
                column: "business_date");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_folio",
                schema: "production",
                table: "production_close",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_production_close_output_lot_id",
                schema: "production",
                table: "production_close",
                column: "output_lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_production_order_id_sequence",
                schema: "production",
                table: "production_close",
                columns: new[] { "production_order_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_production_close_line_component_item_id",
                schema: "production",
                table: "production_close_line",
                column: "component_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_line_production_close_id",
                schema: "production",
                table: "production_close_line",
                column: "production_close_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_line_lot_line_id",
                schema: "production",
                table: "production_close_line_lot",
                column: "line_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_close_line_lot_lot_id",
                schema: "production",
                table: "production_close_line_lot",
                column: "lot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "production_close_line_lot",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_close_line",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_close",
                schema: "production");
        }
    }
}
