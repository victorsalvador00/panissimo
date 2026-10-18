"""Builds the web brand assets from the originals at the repository root (they are several MB each).

Usage (from frontend/): python scripts/brand-assets.py
  ../ico.png  → public/favicon.ico (16-64 px), public/brand/icon-180.png and icon-192.png
  ../logo.png → public/brand/logo-bar.webp (header bar) and public/brand/logo.webp (login)

Run it again when an original changes. Requires: pip install pillow
"""
import sys
from pathlib import Path

from PIL import Image

frontend = Path(__file__).resolve().parent.parent
root = frontend.parent
public = frontend / 'public'
brand = public / 'brand'


def square(image: Image.Image) -> Image.Image:
    """Pads the wide icon to a square with its own edge color, so no wheat tip is cut."""
    width, height = image.size
    side = max(width, height)
    background = image.getpixel((2, 2))
    canvas = Image.new('RGBA', (side, side), background)
    canvas.paste(image, ((side - width) // 2, (side - height) // 2))
    return canvas


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def fit_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    brand.mkdir(parents=True, exist_ok=True)

    icon = square(Image.open(root / 'ico.png').convert('RGBA'))
    icon.save(public / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    for size in (180, 192):
        icon.resize((size, size), Image.Resampling.LANCZOS).save(brand / f'icon-{size}.png', optimize=True)

    logo = Image.open(root / 'logo.png').convert('RGB')
    # Header bar: 48 px high on screen, 2x for sharp screens.
    fit_height(logo, 96).save(brand / 'logo-bar.webp', quality=88, method=6)
    # Login: up to 420 px wide on screen, 2x.
    fit_width(logo, 840).save(brand / 'logo.webp', quality=88, method=6)

    for path in [public / 'favicon.ico', *sorted(brand.iterdir())]:
        print(f'{path.relative_to(frontend)}: {path.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
