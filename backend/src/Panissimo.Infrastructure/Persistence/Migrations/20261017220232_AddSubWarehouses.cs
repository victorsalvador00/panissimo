using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSubWarehouses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "parent_location_id",
                schema: "org",
                table: "location",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_location_parent_location_id",
                schema: "org",
                table: "location",
                column: "parent_location_id");

            migrationBuilder.AddForeignKey(
                name: "fk_location_location_parent_location_id",
                schema: "org",
                table: "location",
                column: "parent_location_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_location_location_parent_location_id",
                schema: "org",
                table: "location");

            migrationBuilder.DropIndex(
                name: "ix_location_parent_location_id",
                schema: "org",
                table: "location");

            migrationBuilder.DropColumn(
                name: "parent_location_id",
                schema: "org",
                table: "location");
        }
    }
}
