using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTraceability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_lot_id",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.CreateTable(
                name: "known_permission",
                schema: "security",
                columns: table => new
                {
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_known_permission", x => x.code);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_lot_id_location_id",
                schema: "inventory",
                table: "inventory_movement",
                columns: new[] { "lot_id", "location_id" })
                .Annotation("Npgsql:IndexInclude", new[] { "type", "quantity", "occurred_at" });

            // The permissions that already existed are known: the seed only grants the new ones (D-11) to their system
            // roles, without restoring what the client may have removed from a role.
            migrationBuilder.Sql("""
                INSERT INTO security.known_permission (code, seen_at) VALUES
                    ('locations.view', now()),
                    ('locations.manage', now()),
                    ('locations.all', now()),
                    ('catalog.view', now()),
                    ('catalog.manage', now()),
                    ('inventory.view', now()),
                    ('inventory.adjust', now()),
                    ('inventory.count', now()),
                    ('inventory.consumption', now()),
                    ('inventory.internal_transfers', now()),
                    ('production.view', now()),
                    ('production.recipes.manage', now()),
                    ('production.orders.manage', now()),
                    ('production.orders.close', now()),
                    ('production.orders.import', now()),
                    ('production.areas.manage', now()),
                    ('logistics.view', now()),
                    ('logistics.orders.create', now()),
                    ('logistics.orders.approve', now()),
                    ('logistics.transfers.dispatch', now()),
                    ('logistics.transfers.receive', now()),
                    ('logistics.transfers.special', now()),
                    ('sales.view', now()),
                    ('sales.customers.manage', now()),
                    ('sales.orders.manage', now()),
                    ('sales.shipments.dispatch', now()),
                    ('purchasing.view', now()),
                    ('purchasing.suppliers.manage', now()),
                    ('purchasing.requisitions.manage', now()),
                    ('purchasing.po.manage', now()),
                    ('purchasing.po.approve', now()),
                    ('purchasing.receive', now()),
                    ('security.users.manage', now()),
                    ('security.roles.manage', now()),
                    ('security.audit.view', now()),
                    ('settings.manage', now())
                ON CONFLICT (code) DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "known_permission",
                schema: "security");

            migrationBuilder.DropIndex(
                name: "ix_inventory_movement_lot_id_location_id",
                schema: "inventory",
                table: "inventory_movement");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movement_lot_id",
                schema: "inventory",
                table: "inventory_movement",
                column: "lot_id");
        }
    }
}
