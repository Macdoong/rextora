"""Composite PWA icons and social preview from canonical Rextora brand assets."""

from __future__ import annotations

import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "public/brand/rextora-logo-main-transparent.png"
NAVY = (10, 15, 22, 255)  # #0a0f16


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def load_original_icon() -> Image.Image:
    data = subprocess.check_output(["git", "show", "HEAD:public/icons/icon-512.png"])
    return Image.open(BytesIO(data)).convert("RGBA")


def r_symbol_from_icon(src: Image.Image) -> Image.Image:
    width, height = src.size
    mask = Image.new("L", (width, height), 0)
    mask_px = mask.load()
    pixels = src.load()
    for y in range(height):
        for x in range(width):
            r, g, b, _a = pixels[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            if chroma > 40 and max(r, g, b) > 80:
                mask_px[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask_px = mask.load()
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out_px = out.load()
    for y in range(height):
        for x in range(width):
            if mask_px[x, y] == 0:
                continue
            r, g, b, _a = pixels[x, y]
            if max(r, g, b) > 18:
                out_px[x, y] = (r, g, b, 255)
    bbox = out.getbbox()
    if bbox is None:
        raise RuntimeError("Failed to isolate Rextora R symbol from icon source")
    return out.crop(bbox)


def fit_on_canvas(symbol: Image.Image, size: int, occupancy: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), NAVY)
    target = int(size * occupancy)
    sw, sh = symbol.size
    scale = target / max(sw, sh)
    new_size = (max(1, round(sw * scale)), max(1, round(sh * scale)))
    placed = symbol.resize(new_size, Image.Resampling.LANCZOS)
    x = (size - placed.width) // 2
    y = (size - placed.height) // 2
    canvas.alpha_composite(placed, (x, y))
    return canvas.convert("RGB")


def occupancy_image(im: Image.Image) -> tuple[float, float]:
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            chroma = max(r, g, b) - min(r, g, b)
            if chroma > 40 and max(r, g, b) > 80:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    return ((max_x - min_x + 1) / w, (max_y - min_y + 1) / h)


def write_icon(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def build_og(logo: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (1200, 630), NAVY[:3])
    target_w = 840
    target_h = max(1, round(logo.height * (target_w / logo.width)))
    fitted = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    x = (1200 - fitted.width) // 2
    y = (630 - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    original = load_original_icon()
    before = occupancy_image(original)
    print(f"BEFORE original icon-512 R occupancy: {before[0]*100:.1f}% x {before[1]*100:.1f}%")

    symbol = r_symbol_from_icon(original)
    print(f"Isolated R symbol: {symbol.size[0]}x{symbol.size[1]}")

    any_512 = fit_on_canvas(symbol, 512, 0.80)
    any_192 = fit_on_canvas(symbol, 192, 0.80)
    any_180 = fit_on_canvas(symbol, 180, 0.80)
    maskable_512 = fit_on_canvas(symbol, 512, 0.72)

    outputs = {
        ROOT / "public/icons/icon-512-v2.png": any_512,
        ROOT / "public/icons/icon-192-v2.png": any_192,
        ROOT / "public/icons/icon-512-maskable-v2.png": maskable_512,
        ROOT / "public/icons/icon-512.png": any_512,
        ROOT / "public/icons/icon-192.png": any_192,
        ROOT / "public/icons/icon-512-maskable.png": maskable_512,
        ROOT / "app/icon.png": any_192,
        ROOT / "app/apple-icon.png": any_180,
    }
    for path, image in outputs.items():
        write_icon(image, path)

    og = build_og(load_rgba(LOGO))
    og_path = ROOT / "public/brand/rextora-share-1200x630-v1.png"
    write_icon(og, og_path)

    after_any = occupancy_image(load_rgba(ROOT / "public/icons/icon-512-v2.png"))
    after_mask = occupancy_image(load_rgba(ROOT / "public/icons/icon-512-maskable-v2.png"))
    print(f"AFTER any-512 R occupancy: {after_any[0]*100:.1f}% x {after_any[1]*100:.1f}%")
    print(f"AFTER maskable-512 R occupancy: {after_mask[0]*100:.1f}% x {after_mask[1]*100:.1f}%")
    print(f"OG {og.size[0]}x{og.size[1]} -> {og_path}")


if __name__ == "__main__":
    main()
