using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// RN-113: vehicle and driver catalogs; transfers and shipments link the ones chosen at dispatch. Documents already
    /// dispatched keep only their text copy.
    /// </summary>
    public partial class AddFleet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "driver_id",
                schema: "logistics",
                table: "transfer",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "vehicle_id",
                schema: "logistics",
                table: "transfer",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "driver_id",
                schema: "sales",
                table: "customer_shipment",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "vehicle_id",
                schema: "sales",
                table: "customer_shipment",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "driver",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_driver", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "vehicle",
                schema: "logistics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    plate = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    description = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_vehicle", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transfer_driver_id",
                schema: "logistics",
                table: "transfer",
                column: "driver_id");

            migrationBuilder.CreateIndex(
                name: "ix_transfer_vehicle_id",
                schema: "logistics",
                table: "transfer",
                column: "vehicle_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_driver_id",
                schema: "sales",
                table: "customer_shipment",
                column: "driver_id");

            migrationBuilder.CreateIndex(
                name: "ix_customer_shipment_vehicle_id",
                schema: "sales",
                table: "customer_shipment",
                column: "vehicle_id");

            migrationBuilder.CreateIndex(
                name: "ix_driver_name",
                schema: "logistics",
                table: "driver",
                column: "name");

            migrationBuilder.CreateIndex(
                name: "ix_vehicle_plate",
                schema: "logistics",
                table: "vehicle",
                column: "plate",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_customer_shipment_drivers_driver_id",
                schema: "sales",
                table: "customer_shipment",
                column: "driver_id",
                principalSchema: "logistics",
                principalTable: "driver",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_customer_shipment_vehicles_vehicle_id",
                schema: "sales",
                table: "customer_shipment",
                column: "vehicle_id",
                principalSchema: "logistics",
                principalTable: "vehicle",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_driver_driver_id",
                schema: "logistics",
                table: "transfer",
                column: "driver_id",
                principalSchema: "logistics",
                principalTable: "driver",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_transfer_vehicles_vehicle_id",
                schema: "logistics",
                table: "transfer",
                column: "vehicle_id",
                principalSchema: "logistics",
                principalTable: "vehicle",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_customer_shipment_drivers_driver_id",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropForeignKey(
                name: "fk_customer_shipment_vehicles_vehicle_id",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropForeignKey(
                name: "fk_transfer_driver_driver_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropForeignKey(
                name: "fk_transfer_vehicles_vehicle_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropTable(
                name: "driver",
                schema: "logistics");

            migrationBuilder.DropTable(
                name: "vehicle",
                schema: "logistics");

            migrationBuilder.DropIndex(
                name: "ix_transfer_driver_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropIndex(
                name: "ix_transfer_vehicle_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropIndex(
                name: "ix_customer_shipment_driver_id",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropIndex(
                name: "ix_customer_shipment_vehicle_id",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropColumn(
                name: "driver_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropColumn(
                name: "vehicle_id",
                schema: "logistics",
                table: "transfer");

            migrationBuilder.DropColumn(
                name: "driver_id",
                schema: "sales",
                table: "customer_shipment");

            migrationBuilder.DropColumn(
                name: "vehicle_id",
                schema: "sales",
                table: "customer_shipment");
        }
    }
}
