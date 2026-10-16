using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductionOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "production_order",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recipe_id = table.Column<Guid>(type: "uuid", nullable: false),
                    output_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    planned_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    produced_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    scheduled_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    released_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    output_lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_order", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_order_item_output_item_id",
                        column: x => x.output_item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_location_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_lot_output_lot_id",
                        column: x => x.output_lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_recipes_recipe_id",
                        column: x => x.recipe_id,
                        principalSchema: "production",
                        principalTable: "recipe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "production_order_line",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    component_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    theoretical_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    theoretical_produced_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    actual_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    total_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_order_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_order_line_item_component_item_id",
                        column: x => x.component_item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_line_production_order_order_id",
                        column: x => x.order_id,
                        principalSchema: "production",
                        principalTable: "production_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "production_order_line_lot",
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
                    table.PrimaryKey("pk_production_order_line_lot", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_order_line_lot_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_line_lot_production_order_line_line_id",
                        column: x => x.line_id,
                        principalSchema: "production",
                        principalTable: "production_order_line",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_folio",
                schema: "production",
                table: "production_order",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_production_order_location_id_scheduled_date",
                schema: "production",
                table: "production_order",
                columns: new[] { "location_id", "scheduled_date" });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_output_item_id",
                schema: "production",
                table: "production_order",
                column: "output_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_output_lot_id",
                schema: "production",
                table: "production_order",
                column: "output_lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_recipe_id",
                schema: "production",
                table: "production_order",
                column: "recipe_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_status",
                schema: "production",
                table: "production_order",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_component_item_id",
                schema: "production",
                table: "production_order_line",
                column: "component_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_order_id",
                schema: "production",
                table: "production_order_line",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_lot_line_id",
                schema: "production",
                table: "production_order_line_lot",
                column: "line_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_lot_lot_id",
                schema: "production",
                table: "production_order_line_lot",
                column: "lot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "production_order_line_lot",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_order_line",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_order",
                schema: "production");
        }
    }
}
