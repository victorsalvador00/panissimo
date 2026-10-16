using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "item_location_cost",
                schema: "inventory",
                columns: table => new
                {
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    average_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_location_cost", x => new { x.location_id, x.item_id });
                    table.ForeignKey(
                        name: "fk_item_location_cost_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_item_location_cost_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "lot",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_number = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    expiration_date = table.Column<DateOnly>(type: "date", nullable: true),
                    created_from_doc_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    created_from_doc_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_lot", x => x.id);
                    table.ForeignKey(
                        name: "fk_lot_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "inventory_movement",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    total_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    source_doc_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    source_doc_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_doc_folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inventory_movement", x => x.id);
                    table.ForeignKey(
                        name: "fk_inventory_movement_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_inventory_movement_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_inventory_movement_lots_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_inventory_movement_user_user_id",
                        column: x => x.user_id,
                        principalSchema: "security",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stock_balance",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_stock_balance", x => x.id);
                    table.ForeignKey(
                        name: "fk_stock_balance_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_stock_balance_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_stock_balance_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_item_id",
                schema: "inventory",
                table: "inventory_movement",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_location_id_item_id_occurred_at",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "location_id", "item_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_lot_id",
                schema: "inventory",
                table: "inventory_movement",
                column: "lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_source_doc_type_source_doc_id",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "source_doc_type", "source_doc_id" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_user_id",
                schema: "inventory",
                table: "inventory_movement",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_item_location_cost_item_id",
                schema: "inventory",
                table: "item_location_cost",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_lot_item_id_expiration_date",
                schema: "inventory",
                table: "lot",
                columns: new[] { "item_id", "expiration_date" });

            migrationBuilder.CreateIndex(
                name: "ix_lot_item_id_lot_number",
                schema: "inventory",
                table: "lot",
                columns: new[] { "item_id", "lot_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_stock_balance_item_id",
                schema: "inventory",
                table: "stock_balance",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_stock_balance_location_id_item_id_lot_id",
                schema: "inventory",
                table: "stock_balance",
                columns: new[] { "location_id", "item_id", "lot_id" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "ix_stock_balance_lot_id",
                schema: "inventory",
                table: "stock_balance",
                column: "lot_id");

            // RN-01: the kardex is immutable; corrections are new movements.
            migrationBuilder.Sql("""
                CREATE FUNCTION inventory.reject_movement_change() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'inventory_movement is immutable (RN-01)';
                END;
                $$;
                CREATE TRIGGER inventory_movement_immutable
                    BEFORE UPDATE OR DELETE ON inventory.inventory_movement
                    FOR EACH ROW EXECUTE FUNCTION inventory.reject_movement_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER IF EXISTS inventory_movement_immutable ON inventory.inventory_movement;
                DROP FUNCTION IF EXISTS inventory.reject_movement_change();
                """);

            migrationBuilder.DropTable(
                name: "inventory_movement",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "item_location_cost",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "stock_balance",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "lot",
                schema: "inventory");
        }
    }
}
