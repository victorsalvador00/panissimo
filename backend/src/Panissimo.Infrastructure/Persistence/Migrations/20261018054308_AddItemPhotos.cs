using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Panissimo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddItemPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "item_photo",
                schema: "catalog",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revision = table.Column<long>(type: "bigint", nullable: false),
                    image = table.Column<byte[]>(type: "bytea", nullable: false),
                    image_content_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    thumbnail = table.Column<byte[]>(type: "bytea", nullable: false),
                    thumbnail_content_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_photo", x => x.item_id);
                    table.ForeignKey(
                        name: "fk_item_photo_item_item_id",
                        column: x => x.item_id,
                        principalSchema: "catalog",
                        principalTable: "item",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "item_photo",
                schema: "catalog");
        }
    }
}
