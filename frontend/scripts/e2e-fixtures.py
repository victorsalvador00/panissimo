"""Fixtures of the E2E tests: Excel files (e2e/fixtures/*.xlsx) and a photo (foto-e2e.png).

Local tool, like brand-assets.py: needs openpyxl (MIT), which is not a project dependency.
Run from /frontend: python scripts/e2e-fixtures.py
"""

import struct
import zlib
from pathlib import Path

from openpyxl import Workbook

FIXTURES = Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
HEADERS = ["fecha", "sku", "cantidad", "area", "turno", "ubicacion", "notas"]


def workbook(path: Path, headers: list[str], rows: list[list[object]]) -> None:
    book = Workbook()
    sheet = book.active
    sheet.title = "OP"
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    book.save(path)
    print(path.name)


# E2E 8: a date in the past, an unknown SKU and a negative quantity (RN-90, RN-91).
workbook(
    FIXTURES / "ordenes-con-errores.xlsx",
    HEADERS,
    [
        ["01/01/2020", "E2E-MASA", 5, "", "", "", ""],
        ["31/12/2030", "NO-EXISTE", 5, "", "", "", ""],
        ["31/12/2030", "E2E-MASA", -2, "", "", "", ""],
    ],
)

# E2E 8: three rows, two with the same key (RN-92: 3 rows → 2 orders) and an unknown column (a warning, RN-90/93).
workbook(
    FIXTURES / "ordenes-validas.xlsx",
    HEADERS + ["comentario"],
    [
        ["31/12/2030", "E2E-MASA", 12.5, "", "Día", "", "E2E 8", "se ignora"],
        ["31/12/2030", "E2E-MASA", 7.5, "", "Día", "", "E2E 8", ""],
        ["30/12/2030", "E2E-MASA", 10, "", "", "", "E2E 8", ""],
    ],
)


def png(path: Path, width: int, height: int) -> None:
    """A real PNG (stripes in the brand greens) the browser can decode and resize, written with the standard library."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    stripes = [(0x2E, 0x7D, 0x32), (0xA5, 0xC8, 0xA8), (0xEE, 0xF5, 0xEE)]
    rows = b"".join(
        b"\x00" + bytes(c for x in range(width) for c in stripes[(x + y) // 40 % 3]) for y in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    signature = b"\x89PNG\r\n\x1a\n"
    path.write_bytes(signature + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


# 900 × 600: bigger than the 512 px of the photo, so the test also checks the resize.
png(FIXTURES / "foto-e2e.png", 900, 600)
