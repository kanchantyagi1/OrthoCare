"""Generates the in-app brand images under mobile/assets/images/ from mobile/branding/.

brand_hero.png - from lockscreen.png. That art is a 941x1672 portrait poster whose
  upper half is the PrimeOrtho mark, wordmark and both taglines, drawn on a soft
  white glow that is partly transparent (it was designed to sit on white). It is
  flattened onto white, cropped to the brand lockup, and given feathered edges so
  it melts into the light page behind it instead of showing a rectangle. Used on
  the entry screens (welcome, staff login, patient start, splash).

brand_mark.png - the mark alone on transparency, lifted from app-icon.png the same
  way the launcher icons are (see generate_launcher_icons.py). Used where a small
  brand glyph is needed (chat avatar, headers).

Run:  python mobile/tool/generate_brand_images.py
"""

import os

import numpy as np
from PIL import Image

from generate_launcher_icons import MARK_ROTATION, load_mark, white_to_alpha

MOBILE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCKSCREEN = os.path.join(MOBILE, "branding", "lockscreen.png")
OUT = os.path.join(MOBILE, "assets", "images")

# The lockup inside lockscreen.png: mark top ~195, second tagline rule ~848,
# wordmark/taglines span x ~160-795. Padded so the feathering never touches them.
HERO_BOX = (88, 150, 853, 900)
# Feather widths as a fraction of the crop: the edges hold only glow/swooshes.
FEATHER = {"left": 0.11, "right": 0.11, "top": 0.08, "bottom": 0.06}
# Channel values above WHITEN_FROM fade smoothly to pure white by WHITEN_TO.
WHITEN_FROM = 0.72
WHITEN_TO = 0.93
# The mark inside the hero crop: it spans x 163-588, y 45-467, and the wordmark
# starts at y 476. It is turned like the launcher mark (MARK_ROTATION) about the
# centre of its circle, which keeps it inside the same area, clear of the text.
HERO_MARK_BOX = (150, 30, 602, 472)
HERO_MARK_CENTER = (375, 256)


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def hero() -> None:
    src = Image.open(LOCKSCREEN).convert("RGBA")
    flat = Image.new("RGBA", src.size, (255, 255, 255, 255))
    flat.alpha_composite(src)
    crop = flat.crop(HERO_BOX)
    # The poster's backdrop behind the lockup is a light grey haze and pale blue
    # swooshes, which read as a faint grey box on a white page. Lift every light
    # tone to white with a smooth per-channel curve: the lockup's navy, orange,
    # grey ball and dark tagline text are all well below the knee and keep their
    # colour, while anti-aliased edges stay smooth because the curve is monotonic.
    rgb = np.asarray(crop)[..., :3].astype(np.float64) / 255.0
    lift = smoothstep((rgb - WHITEN_FROM) / (WHITEN_TO - WHITEN_FROM))
    rgb = rgb + (1.0 - rgb) * lift
    crop = Image.fromarray(
        np.dstack([(rgb * 255).round().astype(np.uint8), np.asarray(crop)[..., 3]]), "RGBA"
    )
    crop = rotate_hero_mark(crop)
    w, h = crop.size
    xs = np.arange(w)[None, :] / (w - 1)
    ys = np.arange(h)[:, None] / (h - 1)
    a = (
        smoothstep(xs / FEATHER["left"])
        * smoothstep((1 - xs) / FEATHER["right"])
        * smoothstep(ys / FEATHER["top"])
        * smoothstep((1 - ys) / FEATHER["bottom"])
    )
    arr = np.asarray(crop).copy()
    arr[..., 3] = (a * 255).round().astype(np.uint8)
    out = Image.fromarray(arr, "RGBA")
    path = os.path.join(OUT, "brand_hero.png")
    out.save(path, "PNG", optimize=True)
    print(f"  brand_hero.png {w}x{h}")


def rotate_hero_mark(crop: Image.Image) -> Image.Image:
    """Lift the mark out of the (whitened) lockup, turn it, and put it back."""
    layer = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    layer.alpha_composite(white_to_alpha(crop.crop(HERO_MARK_BOX)), HERO_MARK_BOX[:2])
    cx, cy = HERO_MARK_CENTER
    r = max(cx - HERO_MARK_BOX[0], HERO_MARK_BOX[2] - cx, cy - HERO_MARK_BOX[1], HERO_MARK_BOX[3] - cy)
    square = (cx - r, cy - r, cx + r, cy + r)
    turned = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    turned.alpha_composite(layer.crop(square).transpose(MARK_ROTATION), square[:2])
    # Nothing may land on the wordmark below the mark's area.
    assert turned.crop((0, HERO_MARK_BOX[3], *crop.size)).getbbox() is None, "rotated mark hits the wordmark"
    out = crop.copy()
    out.paste((255, 255, 255, 255), HERO_MARK_BOX)
    out.alpha_composite(turned)
    return out


def mark() -> None:
    m = load_mark()
    bbox = m.getbbox()
    m = m.crop(bbox)
    side = max(m.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(m, ((side - m.width) // 2, (side - m.height) // 2))
    sq = sq.resize((384, 384), Image.LANCZOS)
    sq.save(os.path.join(OUT, "brand_mark.png"), "PNG", optimize=True)
    print("  brand_mark.png 384x384")


def feature_graphic() -> None:
    """Play Store feature graphic (1024x500, opaque): the lockup on the left, the
    poster's glowing-knee illustration on the right, feathered into white."""
    W, H = 1024, 500
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))

    flat = Image.new("RGBA", Image.open(LOCKSCREEN).size, (255, 255, 255, 255))
    flat.alpha_composite(Image.open(LOCKSCREEN).convert("RGBA"))
    knee = flat.crop((520, 960, 941, 1600))  # the knee joint and its rings
    scale = H / knee.height
    knee = knee.resize((round(knee.width * scale), H), Image.LANCZOS)
    arr = np.asarray(knee).copy()
    xs = np.arange(knee.width)[None, :] / (knee.width - 1)
    arr[..., 3] = (smoothstep(xs / 0.45) * 255).round().astype(np.uint8)  # fade in from the left
    canvas.alpha_composite(Image.fromarray(arr, "RGBA"), (W - knee.width, 0))

    lockup = Image.open(os.path.join(OUT, "brand_hero.png"))
    lh = 440
    lockup = lockup.resize((round(lockup.width * lh / lockup.height), lh), Image.LANCZOS)
    canvas.alpha_composite(lockup, (56, (H - lh) // 2))

    path = os.path.join(MOBILE, "branding", "play-store", "feature-graphic-1024x500.png")
    canvas.convert("RGB").save(path, "PNG", optimize=True)
    print("  play-store/feature-graphic-1024x500.png")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    hero()
    mark()
    feature_graphic()
