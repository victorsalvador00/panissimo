using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSuppliers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "supplier",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    tax_id = table.Column<string>(type: "character varying(13)", maxLength: 13, nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    contact_name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    payment_terms_days = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_supplier", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "supplier_item",
                schema: "purchasing",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    supplier_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    supplier_sku = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    price = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    lead_time_days = table.Column<int>(type: "integer", nullable: false),
                    is_preferred = table.Column<bool>(type: "boolean", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_supplier_item", x => x.id);
                    table.ForeignKey(
                        name: "fk_supplier_item_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_supplier_item_supplier_supplier_id",
                        column: x => x.supplier_id,
                        principalSchema: "purchasing",
                        principalTable: "supplier",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_supplier_name",
                schema: "purchasing",
                table: "supplier",
                column: "name");

            migrationBuilder.CreateIndex(
                name: "ix_supplier_tax_id",
                schema: "purchasing",
                table: "supplier",
                column: "tax_id",
                unique: true,
                filter: "tax_id NOT IN ('XAXX010101000', 'XEXX010101000')");

            migrationBuilder.CreateIndex(
                name: "ix_supplier_item_item_id",
                schema: "purchasing",
                table: "supplier_item",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ix_supplier_item_supplier_id_item_id",
                schema: "purchasing",
                table: "supplier_item",
                columns: new[] { "supplier_id", "item_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_supplier_item_one_preferred_per_item",
                schema: "purchasing",
                table: "supplier_item",
                column: "item_id",
                unique: true,
                filter: "is_preferred");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "supplier_item",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "supplier",
                schema: "purchasing");
        }
    }
}
