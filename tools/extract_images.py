"""Extract embedded image XObjects from the rules PDF.

Outputs raw duplicates to tools/extracted/ for manual curation.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from pypdf import PdfReader
from PIL import Image as PILImage
import io

PDF_PATH = Path(r"C:\Users\ziyl0\Downloads\再造太阳系中文规则.pdf")
OUT_DIR = Path(__file__).resolve().parent / "extracted"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    reader = PdfReader(str(PDF_PATH))
    seen: set[str] = set()
    count = 0
    for page_idx, page in enumerate(reader.pages, start=1):
        for img_idx, image in enumerate(page.images, start=1):
            try:
                data = image.data
            except Exception as exc:
                print(f"page {page_idx} img {img_idx}: cannot read data ({exc})")
                continue
            digest = hashlib.sha1(data).hexdigest()[:12]
            if digest in seen:
                continue
            seen.add(digest)
            try:
                pil = PILImage.open(io.BytesIO(data))
                if pil.mode in ("CMYK", "P"):
                    pil = pil.convert("RGB")
            except Exception as exc:
                print(f"page {page_idx} img {img_idx}: PIL open failed ({exc})")
                continue
            name = getattr(image, "name", f"img{img_idx}")
            out_path = OUT_DIR / f"p{page_idx:02d}_{name}_{digest}.png"
            pil.save(out_path, optimize=True)
            count += 1
            print(f"page {page_idx:02d} {name}: {pil.size} {pil.mode} -> {out_path.name}")
    print(f"Done. {count} unique images extracted to {OUT_DIR}")


if __name__ == "__main__":
    main()
