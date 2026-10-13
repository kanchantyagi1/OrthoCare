"""Generates the Prime Ortho launcher icons (and the Play Store icon) from the brand art.

Source: mobile/branding/app-icon.png - a 1254x1254 render of the PrimeOrtho mark
(navy arrow + orange arc + figure) drawn INSIDE a white rounded-square tile with a
drop shadow, on a near-white page.

That source cannot be used as-is anywhere on Android:
- As an adaptive-icon foreground, the baked-in rounded square + shadow would be
  masked again by the launcher (a rounded square inside a circle), and the mark
  would end up tiny.
- As a legacy icon, the soft grey shadow and off-white page show as a dirty halo.

So the mark itself is lifted out of the tile (MARK_BOX, measured from the art) and
everything is rebuilt from it:

1. Adaptive icon (API 26+, i.e. virtually every device in use):
   - background: flat white colour layer.
   - foreground: the mark on transparency (white converted to alpha, which is
     exactly reversible over the white background, so anti-aliased edges and the
     soft grey "ball" render identically). Scaled so the mark's farthest pixel -
     measured RADIALLY, because launcher masks are circles/squircles - lands just
     inside Android's 66dp guaranteed-visible safe zone.
   - monochrome: a single-colour silhouette for Android 13+ themed icons.
2. Legacy ic_launcher / ic_launcher_round (API < 26): the mark on a white rounded
   square / circle with a hairline edge so it doesn't vanish on light wallpapers.
3. Play Store listing icon (512x512, full-bleed - Play applies its own mask).

Run from anywhere:  python mobile/tool/generate_launcher_icons.py
"""

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MOBILE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_PATH = os.path.join(MOBILE, "branding", "app-icon.png")
RES_DIR = os.path.join(MOBILE, "android", "app", "src", "main", "res")
PLAY_ICON_PATH = os.path.join(MOBILE, "branding", "play-store", "play-store-icon-512.png")

# The mark's bounding box inside the source tile, padded slightly so anti-aliased
# edges are kept. Measured from the art: content spans x 163-1106, y 158-1095,
# well inside the white tile (which itself spans ~65-1190), so no tile edge or
# shadow is included.
MARK_BOX = (148, 143, 1121, 1110)

# The source art has the arrow pointing to ~5 o'clock; the brand shows it at
# ~2 o'clock, so the whole mark is turned 90 degrees anticlockwise (lossless).
MARK_ROTATION = Image.Transpose.ROTATE_90

# Anything this close to white counts as page, not mark (clears faint shadow/noise).
WHITE_THRESHOLD = 10

LEGACY_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# Android guarantees a 66dp-diameter circle of the 108dp adaptive canvas is visible
# under every launcher mask. The mark's farthest pixel is placed at 97% of that
# radius: as large as possible without relying on any one launcher's mask maths.
SAFE_ZONE_RADIUS_FRACTION = (66 / 108) / 2
SAFE_ZONE_MARGIN = 0.97

BACKGROUND_HEX = "#FFFFFF"
EDGE_COLOR = (226, 231, 238, 255)  # hairline on legacy tiles, from the brand's cool greys
SUPERSAMPLE = 4


def load_mark() -> Image.Image:
    """The mark on transparency, turned to the brand orientation (see MARK_ROTATION)."""
    src = Image.open(SOURCE_PATH).convert("RGB").crop(MARK_BOX)
    return white_to_alpha(src).transpose(MARK_ROTATION)


def white_to_alpha(src: Image.Image) -> Image.Image:
    """Art drawn on white -> the same art on transparency, reversible over white."""
    rgb = np.asarray(src.convert("RGB")).astype(np.float64)
    # Colour-to-alpha against white: the least alpha that reproduces the pixel
    # when composited back over white.
    diff = np.max(255.0 - rgb, axis=2)
    alpha = diff / 255.0
    alpha[diff < WHITE_THRESHOLD] = 0.0
    # The tile's grey drop shadow pokes into the crop's corners (outside the tile's
    # rounded corners) and is faint enough to pass the white threshold. Keep alpha
    # only near pixels that are unmistakably mark - dilated so the mark's own
    # anti-aliased edges survive - and drop everything else.
    core = Image.fromarray(((diff > 60) * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(15))
    alpha[np.asarray(core) == 0] = 0.0
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    color = (rgb - 255.0 * (1.0 - alpha[..., None])) / safe
    out = np.dstack([np.clip(color, 0, 255), alpha * 255.0]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def radial_extent(mark: Image.Image) -> float:
    """Farthest visible pixel from the mark's centre, in source pixels."""
    a = np.asarray(mark)[..., 3]
    ys, xs = np.nonzero(a > 8)
    cx, cy = (mark.width - 1) / 2, (mark.height - 1) / 2
    return float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())


def place(mark: Image.Image, canvas: int, extent_px: float, target_radius_px: float) -> Image.Image:
    """Mark scaled so its radial extent == target radius, centred on a transparent canvas."""
    scale = target_radius_px / extent_px
    w, h = round(mark.width * scale), round(mark.height * scale)
    resized = mark.resize((w, h), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(resized, ((canvas - w) // 2, (canvas - h) // 2))
    return out


def tile(size: int, shape: str) -> Image.Image:
    """White legacy tile (rounded square or circle) with a hairline edge, supersampled."""
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    inset = round(big * 0.04)
    box = (inset, inset, big - inset - 1, big - inset - 1)
    edge = max(1, round(big * 0.008))
    if shape == "circle":
        d.ellipse(box, fill=EDGE_COLOR)
        d.ellipse(tuple(v + (edge if i < 2 else -edge) for i, v in enumerate(box)), fill=(255, 255, 255, 255))
    else:
        r = round(big * 0.22)
        d.rounded_rectangle(box, r, fill=EDGE_COLOR)
        inner = tuple(v + (edge if i < 2 else -edge) for i, v in enumerate(box))
        d.rounded_rectangle(inner, r - edge, fill=(255, 255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


def write_adaptive(mark: Image.Image, extent: float) -> None:
    for density, canvas in ADAPTIVE_SIZES.items():
        out_dir = os.path.join(RES_DIR, f"mipmap-{density}")
        target = canvas * SAFE_ZONE_RADIUS_FRACTION * SAFE_ZONE_MARGIN
        fg = place(mark, canvas * SUPERSAMPLE, extent, target * SUPERSAMPLE).resize((canvas, canvas), Image.LANCZOS)
        fg.save(os.path.join(out_dir, "ic_launcher_foreground.png"), "PNG", optimize=True)

        # Themed-icon silhouette: one colour, shape only (the launcher tints it).
        a = np.asarray(fg)[..., 3]
        mono = np.zeros((canvas, canvas, 4), dtype=np.uint8)
        mono[..., :3] = 255
        mono[..., 3] = np.where(a > 0, np.minimum(255, a.astype(int) * 3), 0).astype(np.uint8)
        Image.fromarray(mono, "RGBA").save(os.path.join(out_dir, "ic_launcher_monochrome.png"), "PNG", optimize=True)

        # Verify against the rendered pixels, not the maths.
        ys, xs = np.nonzero(a > 8)
        c = (canvas - 1) / 2
        reach = float(np.sqrt((xs - c) ** 2 + (ys - c) ** 2).max())
        safe = canvas * SAFE_ZONE_RADIUS_FRACTION
        assert reach <= safe, f"{density}: mark reaches {reach:.1f}px, safe zone is {safe:.1f}px"
        print(f"  adaptive {density}: {canvas}px canvas, mark reaches {reach:.1f}px of {safe:.1f}px safe radius")


def write_legacy(mark: Image.Image, extent: float) -> None:
    for density, size in LEGACY_SIZES.items():
        out_dir = os.path.join(RES_DIR, f"mipmap-{density}")
        for name, shape, fill in (("ic_launcher.png", "square", 0.40), ("ic_launcher_round.png", "circle", 0.36)):
            base = tile(size, shape)
            big = size * SUPERSAMPLE
            logo = place(mark, big, extent, big * fill).resize((size, size), Image.LANCZOS)
            base.alpha_composite(logo)
            base.save(os.path.join(out_dir, name), "PNG", optimize=True)
        print(f"  legacy {density}: {size}px ic_launcher.png + ic_launcher_round.png")


def write_xml() -> None:
    with open(os.path.join(RES_DIR, "values", "colors.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">{BACKGROUND_HEX}</color>\n'
            "</resources>\n"
        )
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
        "</adaptive-icon>\n"
    )
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(RES_DIR, "mipmap-anydpi-v26", name), "w", encoding="utf-8", newline="\n") as f:
            f.write(xml)
    print("  colors.xml + mipmap-anydpi-v26/ic_launcher(.round).xml")


def write_play_icon(mark: Image.Image, extent: float) -> None:
    size = 512
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    img.alpha_composite(place(mark, big, extent, big * 0.40))
    os.makedirs(os.path.dirname(PLAY_ICON_PATH), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).convert("RGB").save(PLAY_ICON_PATH, "PNG", optimize=True)
    print(f"  {os.path.relpath(PLAY_ICON_PATH, MOBILE)} (512x512, opaque)")


def main() -> None:
    mark = load_mark()
    extent = radial_extent(mark)
    print(f"Mark {mark.width}x{mark.height}, radial extent {extent:.0f}px")
    print("Adaptive icons:")
    write_adaptive(mark, extent)
    print("Legacy icons:")
    write_legacy(mark, extent)
    print("XML:")
    write_xml()
    print("Play Store:")
    write_play_icon(mark, extent)


if __name__ == "__main__":
    main()
