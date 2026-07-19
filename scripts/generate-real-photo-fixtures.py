#!/usr/bin/env python3
"""
Converts the real product photos in e2e/images/*.jpg into video fixtures at
e2e/fixtures/<name>.y4m, for the same purpose as
generate-e2e-barcode-fixture.py: feeding Chromium's fake camera device
(--use-file-for-fake-video-capture) in the Playwright e2e suite. Unlike that
script, these barcodes aren't synthetic — they're genuine photos, so this
just orients (phones report portrait photos as landscape + an EXIF rotation
tag, which PIL does not apply automatically) and resizes them; nothing here
"fixes" barcode readability.

One of the five (dog-treat.jpg) is genuinely out-of-focus and does not
decode even after this processing — see the `decodable: false` note on it in
e2e/fixtures/real-products.ts. That's intentional, not a pipeline bug: it's
used as a "camera can't read this, falls back to manual entry" test case.

Requires: Pillow, ffmpeg on PATH (same as generate-e2e-barcode-fixture.py;
not part of the npm project).

Usage:
  python3 scripts/generate-real-photo-fixtures.py
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = REPO_ROOT / "e2e" / "images"
FIXTURES_DIR = REPO_ROOT / "e2e" / "fixtures"

# Matches the resolution decode was verified against — see the comment in
# e2e/fixtures/real-products.ts about how ground-truth barcode values were
# established. Keeping this in sync matters: a different resize could change
# whether a borderline image decodes.
MAX_DIMENSION = 1200


def main() -> None:
    tmp_dir = REPO_ROOT / ".fixture-tmp"
    tmp_dir.mkdir(exist_ok=True)
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    jpgs = sorted(IMAGES_DIR.glob("*.jpg"))
    if not jpgs:
        print(f"No .jpg files found in {IMAGES_DIR}")
        return

    for jpg_path in jpgs:
        name = jpg_path.stem
        im = Image.open(jpg_path)
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
        # yuv420p needs even width/height
        w, h = im.size
        w -= w % 2
        h -= h % 2
        im = im.crop((0, 0, w, h))

        frame_path = tmp_dir / f"{name}.png"
        im.save(frame_path)

        out_path = FIXTURES_DIR / f"{name}.y4m"
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loop", "1", "-i", str(frame_path),
                "-t", "1", "-r", "1",
                "-pix_fmt", "yuv420p",
                "-s", f"{w}x{h}",
                str(out_path),
            ],
            check=True,
            capture_output=True,
        )
        print(f"{name}: {im.size} -> {out_path}")

    print()
    print("Re-verify decodability after regenerating — see the standalone")
    print("ZXing decode approach described in e2e/README.md. Update")
    print("e2e/fixtures/real-products.ts if any barcode value or")
    print("decodable status changes.")


if __name__ == "__main__":
    sys.exit(main())
