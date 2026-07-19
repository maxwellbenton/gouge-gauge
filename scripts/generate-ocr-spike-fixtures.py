#!/usr/bin/env python3
"""
Generates synthetic shelf-tag-style price images for the M5 OCR accuracy
spike (scripts/ocr-spike.ts). Not run automatically — outputs are committed
to e2e/fixtures/ocr/ so the spike (and later, an e2e test) don't depend on
regenerating them.

These are synthetic, not real shelf-tag photos: real photos have glare,
skew, tiny/inconsistent fonts, and background clutter a rendered PNG
doesn't. They're useful for proving the OCR + price-extraction pipeline
works mechanically end to end, not for claiming real-world accuracy — see
docs/OCR-SPIKE.md for that caveat spelled out.

Requires (not part of the npm project — one-off tooling): Pillow.

Usage:
  python3 scripts/generate-ocr-spike-fixtures.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "e2e" / "fixtures" / "ocr"

SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
SANS_REGULAR = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def blank(size=(500, 300), bg="white") -> Image.Image:
    return Image.new("RGB", size, bg)


def draw_centered(draw: ImageDraw.ImageDraw, img: Image.Image, y: int, text: str, f, fill="black"):
    bbox = draw.textbbox((0, 0), text, font=f)
    w = bbox[2] - bbox[0]
    draw.text(((img.width - w) / 2, y), text, font=f, fill=fill)


def simple_clean() -> None:
    img = blank()
    draw = ImageDraw.Draw(img)
    draw_centered(draw, img, 40, "STORE BRAND KIBBLE", font(SANS_REGULAR, 28))
    draw_centered(draw, img, 110, "PRICE $12.99", font(SANS_BOLD, 40))
    img.save(OUT_DIR / "simple_clean.png")


def shelf_tag() -> None:
    img = blank(bg="#fff6c9")
    draw = ImageDraw.Draw(img)
    draw_centered(draw, img, 20, "EVERYDAY LOW PRICE", font(SANS_BOLD, 24))
    draw_centered(draw, img, 90, "$8.49", font(SANS_BOLD, 64))
    draw_centered(draw, img, 190, "per lb", font(SANS_REGULAR, 22))
    img.save(OUT_DIR / "shelf_tag.png")


def sale_vs_reg() -> None:
    img = blank()
    draw = ImageDraw.Draw(img)
    draw_centered(draw, img, 20, "CHEW TOY", font(SANS_REGULAR, 26))
    draw_centered(draw, img, 70, "NOW $3.99", font(SANS_BOLD, 48), fill="#b91c1c")
    draw_centered(draw, img, 150, "WAS $5.99", font(SANS_REGULAR, 26))
    img.save(OUT_DIR / "sale_vs_reg.png")


def no_price() -> None:
    img = blank()
    draw = ImageDraw.Draw(img)
    draw_centered(draw, img, 60, "ORGANIC DOG TREATS", font(SANS_BOLD, 30))
    draw_centered(draw, img, 120, "GRAIN FREE  12 OZ BAG", font(SANS_REGULAR, 22))
    img.save(OUT_DIR / "no_price.png")


def blurry_angle() -> None:
    # Same content as shelf_tag(), but rotated, blurred, and lower-contrast —
    # a rough stand-in for a real photo taken at an angle under bad lighting.
    img = blank(bg="#fff6c9", size=(600, 400))
    draw = ImageDraw.Draw(img)
    draw_centered(draw, img, 60, "EVERYDAY LOW PRICE", font(SANS_BOLD, 24))
    draw_centered(draw, img, 150, "$8.49", font(SANS_BOLD, 64), fill="#333333")
    draw_centered(draw, img, 260, "per lb", font(SANS_REGULAR, 22))
    img = img.rotate(9, expand=True, fillcolor="#fff6c9")
    img = img.filter(ImageFilter.GaussianBlur(radius=1.6))
    img.save(OUT_DIR / "blurry_angle.png")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    simple_clean()
    shelf_tag()
    sale_vs_reg()
    no_price()
    blurry_angle()
    print(f"Wrote fixtures to {OUT_DIR}")


if __name__ == "__main__":
    main()
