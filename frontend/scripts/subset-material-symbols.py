"""Builds the local subset of Material Symbols Outlined (frontend §4.1).

Usage: python scripts/subset-material-symbols.py <source.woff2> <icons.json> <output.woff2>

The variable font is pinned to FILL 0, wght 400, GRAD 0, opsz 24 and reduced to the icons in icons.json plus the
characters their ligatures need, so <mat-icon>home</mat-icon> keeps working with a few kilobytes instead of ~3 MB.
Requires: pip install fonttools brotli
"""
import json
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def main(source: str, icons_path: str, output: str) -> None:
    # The Windows console may not be UTF-8; the messages are in Spanish.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    with open(icons_path, encoding="utf-8") as f:
        icons = sorted(set(json.load(f)))

    font = TTFont(source)
    glyphs = {name: ligature_glyph(font, name) for name in icons}
    missing = [name for name, glyph in glyphs.items() if glyph is None]
    if missing:
        sys.exit(f"Íconos que no existen en Material Symbols: {', '.join(missing)}")

    font = instancer.instantiateVariableFont(font, {"FILL": 0, "wght": 400, "GRAD": 0, "opsz": 24})

    characters = sorted({c for name in icons for c in name})
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["rlig", "rclt", "liga"]  # Material Symbols maps names with rlig/rclt
    options.layout_closure = False  # keep only the ligatures of the listed icons
    options.notdef_outline = True
    options.name_IDs = ["*"]
    options.glyph_names = True
    subsetter = Subsetter(options=options)
    subsetter.populate(glyphs=sorted(set(glyphs.values())), unicodes=[ord(c) for c in characters])
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(output)
    print(f"{len(icons)} íconos -> {output}")


def ligature_glyph(font: TTFont, name: str) -> str | None:
    """The glyph the ligature of `name` resolves to. Aliases (location_on, place...) share a glyph with another name."""
    cmap = font.getBestCmap()
    sequence = [cmap.get(ord(c)) for c in name]
    if None in sequence:
        return None
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            subtable = getattr(subtable, "ExtSubTable", subtable)
            for ligature in getattr(subtable, "ligatures", {}).get(sequence[0], []):
                if ligature.Component == sequence[1:]:
                    return ligature.LigGlyph
    return None


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
