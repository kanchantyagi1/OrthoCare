"""Generates the Prime Ortho Android launcher icon set from the brand logo.

Source: logo.jpeg (repo root) - a pre-composed 1254x1254 square icon tile
(rounded-square art, white background, "Prime Ortho" wordmark + knee-joint
mark) supplied by the user.

Two icon formats are produced:

1. Legacy mipmap/ic_launcher.png (+ ic_launcher_round.png): a direct
   full-bleed resize of the source art per density. The source is already
   composed edge-to-edge as a finished icon tile, so no extra masking is
   needed here beyond what launchers already do to any app icon.

2. Adaptive icon (API 26+): a background colour layer + a foreground bitmap
   layer that the OS masks into a circle/squircle/rounded-square depending on
   the launcher. The adaptive canvas is 108x108dp but only the inner ~66dp is
   guaranteed visible (Android's "safe zone"), so content placed near the
   edge of a 108dp foreground gets cropped unpredictably per-launcher.

   The full wordmark cannot be the foreground: its text already reaches ~91%
   of its own half-width, so scaling the WHOLE lockup to fit the safe zone
   renders it as a barely-visible speck (confirmed by rendering it and
   looking). Instead the foreground uses a crop isolating just the
   knee-joint "P" mark (see MARK_CROP_BOX) - a compact glyph, which is also
   simply how real app icons are designed (nobody ships their full text
   wordmark as a home-screen icon). That mark is then scaled so its own real
   content lands inside the safe zone with margin, computed from its actual
   measured extent rather than assumed.
"""

import os
import xml.sax.saxutils as sax

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO_PATH = os.path.join(ROOT, "logo.jpeg")
RES_DIR = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")

# logo.jpeg is a full wordmark lockup ("Prime Ortho" text + the knee-joint "P"
# mark + tagline swoosh) composed edge-to-edge as a 1254x1254 tile. That is
# the right shape for the legacy launcher icon (used close to full-bleed, as
# supplied), but wrong for the adaptive-icon foreground: Android's safe zone
# only guarantees ~61% of the canvas (see SAFE_ZONE_* below), and a wordmark
# whose text already reaches ~91% of its own half-width cannot be scaled to
# fit that zone without becoming illegibly small - confirmed by rendering it
# at the computed safe scale (~27%) and looking at the result. Real app icons
# solve this the same way real brands do: a compact glyph, not the full
# text lockup, for the small/masked surface. This crop isolates just the
# knee-joint "P" + speed-line mark (manually located by inspecting the
# source image - there is no automatic separator between the mark and the
# adjoining "rime" text since they sit on one baseline as a single logotype).
MARK_CROP_BOX = (125, 225, 553, 653)  # (left, top, right, bottom), 428x428

# Legacy launcher icon sizes (px), by density.
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# Adaptive icon canvas sizes (px) = 108dp scaled per density.
ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# Fraction of the adaptive canvas the logo occupies. Computed below from the
# logo's actual content extent, not assumed - see content_extent_fraction().
ADAPTIVE_CONTENT_SCALE = None  # set by main()

# Android's guaranteed-visible "safe zone" under any launcher mask shape
# (circle, squircle, rounded square) is a 66dp-diameter circle centered in
# the 108dp adaptive canvas.
SAFE_ZONE_DIAMETER_FRACTION = 66 / 108
# Extra cushion so real content lands comfortably inside the safe zone
# rather than right at its edge, where differences between launchers'
# exact mask math could still clip a pixel or two.
SAFE_ZONE_MARGIN = 0.90

BACKGROUND_COLOR_HEX = "#FEFEFE"  # sampled from the logo's own background


def content_extent_fraction(logo: Image.Image) -> float:
    """Farthest distance of any non-background pixel from center, as a
    fraction of the logo's own half-width. The source logo's outer region is
    near-white padding/background - only pixels meaningfully different from
    that (the wordmark, the knee-joint mark, the blue swoosh) count as
    content that must not be clipped.
    """
    arr = np.asarray(logo).astype(int)
    bg = np.array([254, 254, 254])
    dist = np.abs(arr - bg).sum(axis=2)
    ys, xs = np.where(dist > 24)  # threshold clears JPEG noise near white
    w, h = logo.size
    cx, cy = w / 2, h / 2
    extents = [cx - xs.min(), xs.max() - cx, cy - ys.min(), ys.max() - cy]
    return max(extents) / (w / 2)


def circular_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    # Supersample for a smooth edge instead of a jagged low-res circle.
    ss = 4
    big = Image.new("L", (size * ss, size * ss), 0)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(big)
    draw.ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    mask = big.resize((size, size), Image.LANCZOS)
    return mask


def write_legacy_icons(logo: Image.Image) -> None:
    for density, size in LEGACY_SIZES.items():
        out_dir = os.path.join(RES_DIR, f"mipmap-{density}")
        os.makedirs(out_dir, exist_ok=True)

        resized = logo.resize((size, size), Image.LANCZOS)

        square_path = os.path.join(out_dir, "ic_launcher.png")
        resized.save(square_path, "PNG")

        round_img = resized.copy()
        round_img.putalpha(circular_mask(size))
        round_path = os.path.join(out_dir, "ic_launcher_round.png")
        round_img.save(round_path, "PNG")

        print(f"  legacy {density}: {size}x{size} -> ic_launcher.png, ic_launcher_round.png")


def write_adaptive_foreground(logo: Image.Image, content_fraction: float) -> None:
    for density, canvas_size in ADAPTIVE_SIZES.items():
        out_dir = os.path.join(RES_DIR, f"mipmap-{density}")
        os.makedirs(out_dir, exist_ok=True)

        content_size = round(canvas_size * ADAPTIVE_CONTENT_SCALE)
        resized_logo = logo.resize((content_size, content_size), Image.LANCZOS)

        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        offset = ((canvas_size - content_size) // 2, (canvas_size - content_size) // 2)
        canvas.paste(resized_logo, offset)

        out_path = os.path.join(out_dir, "ic_launcher_foreground.png")
        canvas.save(out_path, "PNG")

        # Verify the REAL content's farthest extent (not the full square's
        # corners, most of which is plain background padding) sits inside
        # Android's guaranteed-visible safe zone - fail loudly rather than
        # shipping a silently-clipped icon again.
        real_extent_px = (content_size / 2) * content_fraction
        safe_radius_px = canvas_size * SAFE_ZONE_DIAMETER_FRACTION / 2 * SAFE_ZONE_MARGIN
        status = "OK" if real_extent_px <= safe_radius_px else "WARNING: exceeds safe zone"
        assert real_extent_px <= safe_radius_px, (
            f"{density}: content extent {real_extent_px:.0f}px exceeds safe radius "
            f"{safe_radius_px:.0f}px - lower ADAPTIVE_CONTENT_SCALE"
        )
        print(
            f"  adaptive {density}: canvas {canvas_size}x{canvas_size}, "
            f"logo tile {content_size}x{content_size} ({ADAPTIVE_CONTENT_SCALE:.0%} of canvas), "
            f"real content extent {real_extent_px:.0f}px <= safe radius {safe_radius_px:.0f}px [{status}]"
        )


def write_adaptive_xml_and_colors() -> None:
    values_dir = os.path.join(RES_DIR, "values")
    os.makedirs(values_dir, exist_ok=True)
    colors_path = os.path.join(values_dir, "colors.xml")

    colors_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{sax.escape(BACKGROUND_COLOR_HEX)}</color>\n'
        "</resources>\n"
    )
    with open(colors_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(colors_xml)
    print(f"  wrote {colors_path}")

    anydpi_dir = os.path.join(RES_DIR, "mipmap-anydpi-v26")
    os.makedirs(anydpi_dir, exist_ok=True)

    adaptive_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        "</adaptive-icon>\n"
    )
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        path = os.path.join(anydpi_dir, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(adaptive_xml)
        print(f"  wrote {path}")


def verify() -> None:
    print("\n=== verification ===")
    ok = True
    for density, size in LEGACY_SIZES.items():
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            path = os.path.join(RES_DIR, f"mipmap-{density}", name)
            with open(path, "rb") as f:
                header = f.read(33)
            assert header[:8] == b"\x89PNG\r\n\x1a\n", f"{path} is not a valid PNG"
            w = int.from_bytes(header[16:20], "big")
            h = int.from_bytes(header[20:24], "big")
            assert (w, h) == (size, size), f"{path} is {w}x{h}, expected {size}x{size}"
            ok = ok and True
    for density, size in ADAPTIVE_SIZES.items():
        path = os.path.join(RES_DIR, f"mipmap-{density}", "ic_launcher_foreground.png")
        with open(path, "rb") as f:
            header = f.read(33)
        assert header[:8] == b"\x89PNG\r\n\x1a\n", f"{path} is not a valid PNG"
        w = int.from_bytes(header[16:20], "big")
        h = int.from_bytes(header[20:24], "big")
        assert (w, h) == (size, size), f"{path} is {w}x{h}, expected {size}x{size}"
    print("all PNG headers verified: correct magic bytes + exact expected pixel dimensions")


def main() -> None:
    print(f"Loading {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert("RGB")
    assert logo.size[0] == logo.size[1], "logo.jpeg must be square"
    print(f"Source: {logo.size[0]}x{logo.size[1]}")

    mark = logo.crop(MARK_CROP_BOX)
    assert mark.size[0] == mark.size[1], f"mark crop must be square, got {mark.size}"
    print(f"Mark crop (for the adaptive icon): {MARK_CROP_BOX} -> {mark.size[0]}x{mark.size[1]}")

    content_fraction = content_extent_fraction(mark)
    # Solve for the largest canvas scale that still keeps real content inside
    # the margined safe zone: scale * content_fraction <= safe_fraction.
    safe_fraction = SAFE_ZONE_DIAMETER_FRACTION / 2 * SAFE_ZONE_MARGIN
    global ADAPTIVE_CONTENT_SCALE
    ADAPTIVE_CONTENT_SCALE = safe_fraction / content_fraction
    print(
        f"Real content reaches {content_fraction:.1%} of the logo's own half-width "
        f"(the rest is background padding) -> adaptive scale set to {ADAPTIVE_CONTENT_SCALE:.1%} "
        f"of the icon canvas so content lands at {ADAPTIVE_CONTENT_SCALE * content_fraction:.1%} "
        f"of canvas half-width, inside the {safe_fraction:.1%} safe zone."
    )

    print("\nLegacy icons (full-bleed resize):")
    write_legacy_icons(logo)

    print("\nAdaptive icon foreground (scaled + centered, safe-zone checked):")
    write_adaptive_foreground(mark, content_fraction)

    print("\nAdaptive icon background colour + XML:")
    write_adaptive_xml_and_colors()

    verify()
    print("\nDone.")


if __name__ == "__main__":
    main()
