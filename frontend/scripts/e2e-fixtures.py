"""Excel fixtures of the E2E tests (e2e/fixtures/*.xlsx).

Local tool, like brand-assets.py: needs openpyxl (MIT), which is not a project dependency.
Run from /frontend: python scripts/e2e-fixtures.py
"""

from pathlib import Path

from openpyxl import Workbook

FIXTURES = Path(__file__).resolve().parent.parent / "e2e" / "fixtures"
HEADERS = ["fecha", "sku_interno", "cantidad", "area", "turno", "ubicacion", "notas"]


def workbook(path: Path, headers: list[str], rows: list[list[object]]) -> None:
    book = Workbook()
    sheet = book.active
    sheet.title = "OP"
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    book.save(path)
    print(path.name)


# E2E 8: a date in the past, an unknown internal SKU and a negative quantity (RN-90, RN-91).
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
