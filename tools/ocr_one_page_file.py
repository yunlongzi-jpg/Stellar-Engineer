"""OCR a single page and append to docs/rules_raw.md.

Usage: python ocr_one_page_file.py <page_number>
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps
from rapidocr_onnxruntime import RapidOCR

PAGES_DIR = Path(__file__).resolve().parent / "pages"
OUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "rules_raw.md"
PREPROC_DIR = Path(__file__).resolve().parent / "pages_preproc"


def main() -> None:
    page_num = int(sys.argv[1])
    path = PAGES_DIR / f"page-{page_num:02d}.png"
    proc_path = PREPROC_DIR / path.name

    img = Image.open(path).convert("L")
    img = ImageOps.autocontrast(img)
    img = ImageOps.invert(img)
    PREPROC_DIR.mkdir(parents=True, exist_ok=True)
    img.save(proc_path, optimize=True)

    engine = RapidOCR()
    result, elapse = engine(str(proc_path))
    if isinstance(elapse, (list, tuple)):
        timing = " / ".join(f"{e:.3f}s" if isinstance(e, float) else str(e) for e in elapse)
    else:
        timing = f"{elapse:.3f}s" if isinstance(elapse, float) else str(elapse)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("a", encoding="utf-8") as f:
        f.write(f"\n## {path.name}\n")
        f.write(f"<!-- OCR time: {timing} -->\n")
        if not result:
            f.write("*（本页未识别到文本）*\n")
        else:
            for box, text, score in result:
                f.write(f"{text}\n")
    print(f"Done {path.name}: {len(result) if result else 0} lines")


if __name__ == "__main__":
    main()
