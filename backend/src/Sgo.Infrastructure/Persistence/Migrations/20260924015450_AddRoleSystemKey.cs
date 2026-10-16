using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sgo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleSystemKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "system_key",
                schema: "security",
                table: "role",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            // Databases seeded before this migration: identify the system roles by their original names.
            migrationBuilder.Sql("""
                UPDATE security.role r SET system_key = k.key
                FROM (VALUES
                    ('administrator', 'Administrador'),
                    ('operations_manager', 'Gerente de operaciones'),
                    ('purchasing', 'Compras'),
                    ('production_manager', 'Jefe de producción'),
                    ('warehouse', 'Almacén comisariato/fábrica'),
                    ('branch_manager', 'Encargado de sucursal'),
                    ('read_only', 'Consulta')
                ) AS k(key, name)
                WHERE r.is_system AND r.name = k.name;
                """);

            migrationBuilder.CreateIndex(
                name: "ix_role_system_key",
                schema: "security",
                table: "role",
                column: "system_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_role_system_key",
                schema: "security",
                table: "role");

            migrationBuilder.DropColumn(
                name: "system_key",
                schema: "security",
                table: "role");
        }
    }
}
