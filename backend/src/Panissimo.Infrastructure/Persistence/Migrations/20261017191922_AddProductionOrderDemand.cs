using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductionOrderDemand : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "production_order_demand",
                schema: "production",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    production_order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    demand_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    demand_line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_production_order_demand", x => x.id);
                    table.ForeignKey(
                        name: "fk_production_order_demand_production_order_production_order_id",
                        column: x => x.production_order_id,
                        principalSchema: "production",
                        principalTable: "production_order",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_demand_demand_type_demand_line_id",
                schema: "production",
                table: "production_order_demand",
                columns: new[] { "demand_type", "demand_line_id" });

            migrationBuilder.CreateIndex(
                name: "ix_production_order_demand_production_order_id",
                schema: "production",
                table: "production_order_demand",
                column: "production_order_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "production_order_demand",
                schema: "production");
        }
    }
}
