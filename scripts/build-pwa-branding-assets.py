"""Generate Rextora PWA icon V3 and the clean transparent UI mark."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "public/brand/rextora-logo-main-transparent.png"
V2_ANY = ROOT / "public/icons/icon-512-v2.png"
NAVY = (10, 15, 22, 255)


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def occupancy_image(im: Image.Image) -> tuple[float, float, tuple[int, int, int, int]]:
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
    return (
        (max_x - min_x + 1) / w,
        (max_y - min_y + 1) / h,
        (min_x, min_y, max_x, max_y),
    )


def mark_from_logo(logo: Image.Image) -> Image.Image:
    w, h = logo.size
    px = logo.load()
    min_x, min_y, max_x, max_y = w, h, -1, -1
    limit = 145
    for y in range(h):
        for x in range(limit):
            r, g, b, a = px[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            if a > 20 and chroma > 40 and max(r, g, b) > 80:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    pad = 4
    box = (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )
    cropped = logo.crop(box)
    out = Image.new("RGBA", cropped.size, (0, 0, 0, 0))
    src = cropped.load()
    dst = out.load()
    cw, ch = cropped.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = src[x, y]
            if a < 12:
                continue
            chroma = max(r, g, b) - min(r, g, b)
            # Keep colorful R + its anti-aliased edge; drop navy leftovers.
            if chroma < 18 and max(r, g, b) < 40:
                continue
            dst[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    if bbox is None:
        raise RuntimeError("Failed to isolate transparent R mark from logo")
    return out.crop(bbox)


def symbol_from_v2(src: Image.Image) -> Image.Image:
    w, h = src.size
    px = src.load()
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            if chroma > 55 and max(r, g, b) > 100:
                mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))
    mp = mask.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if mp[x, y] == 0:
                continue
            r, g, b, _a = px[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            if chroma < 18 and max(r, g, b) < 36:
                continue
            op[x, y] = (r, g, b, 255)
    bbox = out.getbbox()
    if bbox is None:
        raise RuntimeError("Failed to isolate R symbol from V2 icon")
    return out.crop(bbox)


def fit_on_canvas(symbol: Image.Image, size: int, occupancy: float) -> Image.Image:
    canvas = Image.new("RGB", (size, size), NAVY[:3])
    target = int(size * occupancy)
    sw, sh = symbol.size
    scale = target / max(sw, sh)
    placed = symbol.resize(
        (max(1, round(sw * scale)), max(1, round(sh * scale))),
        Image.Resampling.LANCZOS,
    )
    x = (size - placed.width) // 2
    y = (size - placed.height) // 2
    canvas.paste(placed, (x, y), placed)
    return canvas


def top_row_uniform(im: Image.Image, rows: int = 8) -> bool:
    px = im.convert("RGB").load()
    w, _h = im.size
    expected = NAVY[:3]
    for y in range(rows):
        for x in range(w):
            if px[x, y] != expected:
                return False
    return True


def write_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    v2 = load_rgba(V2_ANY)
    v2_occ = occupancy_image(v2)
    print(f"V2 any occupancy: {v2_occ[0]*100:.1f}% x {v2_occ[1]*100:.1f}% bbox={v2_occ[2]}")

    mark = mark_from_logo(load_rgba(LOGO))
    mark_path = ROOT / "public/brand/rextora-mark-v3.png"
    write_png(mark, mark_path)
    print(f"UI mark {mark.size[0]}x{mark.size[1]} mode={mark.mode} -> {mark_path}")

    symbol = symbol_from_v2(v2)
    print(f"Isolated V3 R symbol: {symbol.size[0]}x{symbol.size[1]}")

    any_512 = fit_on_canvas(symbol, 512, 0.735)
    any_192 = fit_on_canvas(symbol, 192, 0.735)
    any_180 = fit_on_canvas(symbol, 180, 0.735)
    maskable_512 = fit_on_canvas(symbol, 512, 0.665)

    outputs = {
        ROOT / "public/icons/icon-512-v3.png": any_512,
        ROOT / "public/icons/icon-192-v3.png": any_192,
        ROOT / "public/icons/icon-512-maskable-v3.png": maskable_512,
        ROOT / "app/icon.png": any_192,
        ROOT / "app/apple-icon.png": any_180,
    }
    for path, image in outputs.items():
        write_png(image, path)

    any_occ = occupancy_image(any_512.convert("RGBA"))
    mask_occ = occupancy_image(maskable_512.convert("RGBA"))
    print(f"V3 any occupancy: {any_occ[0]*100:.1f}% x {any_occ[1]*100:.1f}% bbox={any_occ[2]}")
    print(f"V3 maskable occupancy: {mask_occ[0]*100:.1f}% x {mask_occ[1]*100:.1f}% bbox={mask_occ[2]}")
    print(f"V3 any top-8 uniform navy: {top_row_uniform(any_512)}")
    print(f"V3 maskable top-8 uniform navy: {top_row_uniform(maskable_512)}")
    print(f"V3 smaller than V2: {any_occ[0] < v2_occ[0] and any_occ[1] < v2_occ[1]}")


if __name__ == "__main__":
    main()
