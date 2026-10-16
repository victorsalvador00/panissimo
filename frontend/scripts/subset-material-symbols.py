"""Genera el subconjunto de Material Symbols Outlined con solo los íconos que usa el SGO AR.

Uso (desde /frontend; lo invoca `npm run icons`):
    python scripts/subset-material-symbols.py <fuente.woff2> <lista.json> <salida.woff2>

Requiere fonttools y brotli (`pip install fonttools brotli`, ambos MIT). Fija los ejes variables
(FILL 0, GRAD 0, opsz 24, wght 400), deja en la tabla de ligaduras solo los íconos de la lista y
recorta la fuente a esos glifos más las letras, dígitos y "_" con los que se escriben los nombres.
"""

import json
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def main(source: str, icons_file: str, output: str) -> None:
    with open(icons_file, encoding="utf-8") as handle:
        icons = set(json.load(handle))
    icons_found = set()

    font = TTFont(source)
    font = instancer.instantiateVariableFont(
        font, {"FILL": 0, "GRAD": 0, "opsz": 24, "wght": 400}
    )

    # El nombre del glifo no siempre es el del ícono (location_on → place), así que se compara el texto
    # que forma cada ligadura. Sin esta poda el subsetter conserva todas: sus letras siempre se quedan.
    char_of = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    glyphs = set()
    for table in ligature_tables(font):
        for first, ligatures in list(table.ligatures.items()):
            kept = []
            for lig in ligatures:
                text = "".join(char_of.get(g, "\0") for g in [first, *lig.Component])
                if text in icons:
                    kept.append(lig)
                    glyphs.add(lig.LigGlyph)
                    icons_found.add(text)
            if kept:
                table.ligatures[first] = kept
            else:
                del table.ligatures[first]

    missing = sorted(icons - icons_found)
    if missing:
        sys.exit(f"Íconos que no existen en la fuente: {', '.join(missing)}")

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["rlig", "liga"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    characters = "abcdefghijklmnopqrstuvwxyz0123456789_"
    subsetter.populate(glyphs=sorted(glyphs), unicodes=[ord(c) for c in characters])
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(output)


def ligature_tables(font):
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if table.LookupType == 7:  # Extension
                table = table.ExtSubTable
            if table.LookupType == 4:  # Ligature
                yield table


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
