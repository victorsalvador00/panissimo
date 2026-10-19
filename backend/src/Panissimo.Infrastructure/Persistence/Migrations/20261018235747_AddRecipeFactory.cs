using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// RN-49: a recipe is linked to the factory where it is produced. Existing recipes take the factory of the Planta
    /// when it has exactly one active factory; otherwise they stay without one and must be assigned in Recetas.
    /// </summary>
    public partial class AddRecipeFactory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "factory_id",
                schema: "production",
                table: "recipe",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_recipe_factory_id",
                schema: "production",
                table: "recipe",
                column: "factory_id");

            migrationBuilder.AddForeignKey(
                name: "fk_recipe_location_factory_id",
                schema: "production",
                table: "recipe",
                column: "factory_id",
                principalSchema: "org",
                principalTable: "location",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql("""
                UPDATE production.recipe
                SET factory_id = (SELECT f.id FROM org.location f JOIN org.location p ON p.id = f.parent_location_id
                                  WHERE p.code = 'PLANTA' AND f.type = 'Factory' AND f.is_active)
                WHERE (SELECT count(*) FROM org.location f JOIN org.location p ON p.id = f.parent_location_id
                       WHERE p.code = 'PLANTA' AND f.type = 'Factory' AND f.is_active) = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_recipe_location_factory_id",
                schema: "production",
                table: "recipe");

            migrationBuilder.DropIndex(
                name: "ix_recipe_factory_id",
                schema: "production",
                table: "recipe");

            migrationBuilder.DropColumn(
                name: "factory_id",
                schema: "production",
                table: "recipe");
        }
    }
}
