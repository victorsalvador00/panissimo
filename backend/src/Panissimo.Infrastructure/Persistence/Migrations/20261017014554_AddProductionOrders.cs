using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductionOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "production_order_import",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    file_sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    row_count = table.Column<int>(type: "integer", nullable: false),
                    order_count = table.Column<int>(type: "integer", nullable: false),
                    released_on_import = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_order_import", x => x.id);
                });

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
                    scheduled_date = table.Column<DateOnly>(type: "date", nullable: false),
                    production_area_id = table.Column<Guid>(type: "uuid", nullable: true),
                    shift = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    import_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    released_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    released_by = table.Column<Guid>(type: "uuid", nullable: true),
                    produced_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    total_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    close_count = table.Column<int>(type: "integer", nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    shortfall_reason = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    shortfall_notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    cancelled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
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
                        name: "fk_production_order_production_area_production_area_id",
                        column: x => x.production_area_id,
                        principalSchema: "production",
                        principalTable: "production_area",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_production_order_production_order_imports_import_id",
                        column: x => x.import_id,
                        principalSchema: "production",
                        principalTable: "production_order_import",
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
                    production_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    component_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    theoretical_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    actual_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
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
                        name: "fk_production_order_line_production_orders_production_order_id",
                        column: x => x.production_order_id,
                        principalSchema: "production",
                        principalTable: "production_order",
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
                name: "ix_production_order_import_id",
                schema: "production",
                table: "production_order",
                column: "import_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_location_id_scheduled_date_status",
                schema: "production",
                table: "production_order",
                columns: new[] { "location_id", "scheduled_date", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_output_item_id_scheduled_date",
                schema: "production",
                table: "production_order",
                columns: new[] { "output_item_id", "scheduled_date" });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_production_area_id",
                schema: "production",
                table: "production_order",
                column: "production_area_id");

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
                name: "ix_production_order_import_file_sha256",
                schema: "production",
                table: "production_order_import",
                column: "file_sha256");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_import_folio",
                schema: "production",
                table: "production_order_import",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_component_item_id",
                schema: "production",
                table: "production_order_line",
                column: "component_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_production_order_line_production_order_id_component_item_id",
                schema: "production",
                table: "production_order_line",
                columns: new[] { "production_order_id", "component_item_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "production_order_line",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_order",
                schema: "production");

            migrationBuilder.DropTable(
                name: "production_order_import",
                schema: "production");
        }
    }
}
