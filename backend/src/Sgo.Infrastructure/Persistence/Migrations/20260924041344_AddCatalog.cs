using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "item_category",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_category", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "item",
                schema: "catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    sku = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    base_uom_id = table.Column<Guid>(type: "uuid", nullable: false),
                    purchase_uom_id = table.Column<Guid>(type: "uuid", nullable: true),
                    purchase_to_base_factor = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    tracks_lots = table.Column<bool>(type: "boolean", nullable: false),
                    shelf_life_days = table.Column<int>(type: "integer", nullable: true),
                    storage_condition = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    tax_rate = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item", x => x.id);
                    table.ForeignKey(
                        name: "fk_item_item_category_category_id",
                        column: x => x.category_id,
                        principalSchema: "catalog",
                        principalTable: "item_category",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_item_units_of_measure_base_uom_id",
                        column: x => x.base_uom_id,
                        principalSchema: "catalog",
                        principalTable: "unit_of_measure",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_item_units_of_measure_purchase_uom_id",
                        column: x => x.purchase_uom_id,
                        principalSchema: "catalog",
                        principalTable: "unit_of_measure",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "item_location_setting",
                schema: "catalog",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    min_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    max_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_location_setting", x => new { x.item_id, x.location_id });
                    table.ForeignKey(
                        name: "fk_item_location_setting_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_item_location_setting_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_item_base_uom_id",
                schema: "catalog",
                table: "item",
                column: "base_uom_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_category_id",
                schema: "catalog",
                table: "item",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_name",
                schema: "catalog",
                table: "item",
                column: "name");

            migrationBuilder.CreateIndex(
                name: "ix_item_purchase_uom_id",
                schema: "catalog",
                table: "item",
                column: "purchase_uom_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_sku",
                schema: "catalog",
                table: "item",
                column: "sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_item_category_name",
                schema: "catalog",
                table: "item_category",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_item_location_setting_location_id",
                schema: "catalog",
                table: "item_location_setting",
                column: "location_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "item_location_setting",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "item",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "item_category",
                schema: "catalog");
        }
    }
}
