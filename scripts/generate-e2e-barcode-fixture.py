#!/usr/bin/env python3
"""
Regenerates e2e/fixtures/barcode.y4m — a short video of a real, valid EAN-13
barcode, used to feed Chromium's fake camera device
(--use-file-for-fake-video-capture) in the Playwright e2e suite. This is not
run automatically; the generated file is committed to the repo. Re-run this
only if you need to change the encoded barcode or the fixture's framing.

Requires (not part of the npm project — one-off tooling):
  pip install python-barcode Pillow
  ffmpeg on PATH

Usage:
  python3 scripts/generate-e2e-barcode-fixture.py
"""

import subprocess
import sys
from pathlib import Path

import barcode
from barcode.writer import ImageWriter
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = REPO_ROOT / "e2e" / "fixtures" / "barcode.y4m"

# 12-digit prefix; python-barcode computes the EAN-13 check digit. ZXing
# reports EAN-13 codes starting with 0 as UPC-A with the leading 0 stripped —
# e2e tests assert against that stripped 12-digit form.
BARCODE_PREFIX = "004023201340"

CANVAS_SIZE = (640, 480)
BARCODE_WIDTH = 560


def main() -> None:
    tmp_dir = REPO_ROOT / ".fixture-tmp"
    tmp_dir.mkdir(exist_ok=True)

    ean = barcode.get_barcode_class("ean13")(BARCODE_PREFIX, writer=ImageWriter())
    full_code = ean.get_fullcode()
    raw_path = ean.save(
        str(tmp_dir / "barcode_raw"),
        options={
            "module_width": 0.6,
            "module_height": 25.0,
            "quiet_zone": 8.0,
            "font_size": 0,
            "text_distance": 0,
            "write_text": False,
        },
    )
    print(f"Generated EAN-13 {full_code}")

    im = Image.open(raw_path).convert("RGB")
    scale = BARCODE_WIDTH / im.width
    im = im.resize((BARCODE_WIDTH, int(im.height * scale)))

    canvas = Image.new("RGB", CANVAS_SIZE, "white")
    cw, ch = canvas.size
    iw, ih = im.size
    canvas.paste(im, ((cw - iw) // 2, (ch - ih) // 2))
    frame_path = tmp_dir / "barcode_frame.png"
    canvas.save(frame_path)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(frame_path),
            "-t", "1", "-r", "2",
            "-pix_fmt", "yuv420p",
            "-s", f"{CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}",
            str(OUTPUT),
        ],
        check=True,
    )
    print(f"Wrote {OUTPUT}")

    stripped = full_code[1:] if full_code.startswith("0") else full_code
    print(f"Expected decoded value (ZXing UPC-A form): {stripped}")
    print("If this differs from FIXTURE_BARCODE in e2e/scan.spec.ts, update it there.")


if __name__ == "__main__":
    sys.exit(main())
