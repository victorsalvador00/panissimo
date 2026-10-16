using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCountsAndConsumptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "consumption",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
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
                    table.PrimaryKey("pk_consumption", x => x.id);
                    table.ForeignKey(
                        name: "fk_consumption_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "physical_count",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    folio = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    snapshot_sequence = table.Column<long>(type: "bigint", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_physical_count", x => x.id);
                    table.ForeignKey(
                        name: "fk_physical_count_item_category_category_id",
                        column: x => x.category_id,
                        principalSchema: "catalog",
                        principalTable: "item_category",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_physical_count_locations_location_id",
                        column: x => x.location_id,
                        principalSchema: "org",
                        principalTable: "location",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "consumption_line",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    entry_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_consumption_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_consumption_line_consumption_entry_id",
                        column: x => x.entry_id,
                        principalSchema: "inventory",
                        principalTable: "consumption",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_consumption_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_consumption_line_lots_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "physical_count_line",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    count_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    lot_id = table.Column<Guid>(type: "uuid", nullable: true),
                    snapshot_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    counted_qty = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    difference = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_physical_count_line", x => x.id);
                    table.ForeignKey(
                        name: "fk_physical_count_line_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_physical_count_line_lot_lot_id",
                        column: x => x.lot_id,
                        principalSchema: "inventory",
                        principalTable: "lot",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_physical_count_line_physical_count_count_id",
                        column: x => x.count_id,
                        principalSchema: "inventory",
                        principalTable: "physical_count",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_consumption_folio",
                schema: "inventory",
                table: "consumption",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_consumption_location_id_business_date",
                schema: "inventory",
                table: "consumption",
                columns: new[] { "location_id", "business_date" });

            migrationBuilder.CreateIndex(
                name: "ix_consumption_status",
                schema: "inventory",
                table: "consumption",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_consumption_line_entry_id",
                schema: "inventory",
                table: "consumption_line",
                column: "entry_id");

            migrationBuilder.CreateIndex(
                name: "ix_consumption_line_item_id",
                schema: "inventory",
                table: "consumption_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_consumption_line_lot_id",
                schema: "inventory",
                table: "consumption_line",
                column: "lot_id");

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_category_id",
                schema: "inventory",
                table: "physical_count",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_folio",
                schema: "inventory",
                table: "physical_count",
                column: "folio",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_status",
                schema: "inventory",
                table: "physical_count",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_physical_count_one_in_progress_per_location",
                schema: "inventory",
                table: "physical_count",
                column: "location_id",
                unique: true,
                filter: "status = 'InProgress'");

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_line_count_id_item_id_lot_id",
                schema: "inventory",
                table: "physical_count_line",
                columns: new[] { "count_id", "item_id", "lot_id" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_line_item_id",
                schema: "inventory",
                table: "physical_count_line",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_physical_count_line_lot_id",
                schema: "inventory",
                table: "physical_count_line",
                column: "lot_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "consumption_line",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "physical_count_line",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "consumption",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "physical_count",
                schema: "inventory");
        }
    }
}
