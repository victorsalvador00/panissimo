using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAdjustments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "sequence",
                schema: "inventory",
                table: "inventory_movement",
                type: "bigint",
                nullable: false,
                defaultValue: 0L)
                .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn);

            migrationBuilder.CreateTable(
                name: "adjustment",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reason = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_adjustment", x => x.id);
                    table.ForeignKey(
                        name: "fk_adjustment_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "adjustment_line",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    adjustment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    unit_cost = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_adjustment_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_adjustment_line_adjustment_adjustment_id",
                        column: x => x.adjustment_id,
                        principalSchema: "inventory",
                        principalTable: "adjustment",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_adjustment_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_adjustment_line_lots_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "location_id", "item_id", "sequence" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_sequence",
                schema: "inventory",
                table: "inventory_movement",
                column: "sequence",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_folio",
                schema: "inventory",
                table: "adjustment",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_location_id_created_at",
                schema: "inventory",
                table: "adjustment",
                columns: new[] { "location_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_status",
                schema: "inventory",
                table: "adjustment",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_line_adjustment_id",
                schema: "inventory",
                table: "adjustment_line",
                column: "adjustment_id");

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_line_item_id",
                schema: "inventory",
                table: "adjustment_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_adjustment_line_lot_id",
                schema: "inventory",
                table: "adjustment_line",
                column: "lot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "adjustment_line",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "adjustment",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_location_id_item_id_sequence",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_sequence",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.DropColumn(
                name: "sequence",
                schema: "inventory",
                table: "inventory_movement");
        }
    }
}
