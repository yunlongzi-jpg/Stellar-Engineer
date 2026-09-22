"""Render each page of the rules PDF to a high-resolution PNG.

Output: tools/pages/page-NN.png  (NN = 01..12)
"""
from pathlib import Path

import pypdfium2 as pdfium

PDF_PATH = Path(r"C:\Users\ziyl0\Downloads\再造太阳系中文规则.pdf")
OUT_DIR = Path(__file__).resolve().parent / "pages"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SCALE = 3  # ~1950x2360 px per page at this A4-ish size


def main() -> None:
    pdf = pdfium.PdfDocument(str(PDF_PATH))
    n = len(pdf)
    print(f"Loaded PDF: {PDF_PATH.name} ({n} pages)")
    for i in range(n):
        page = pdf[i]
        image = page.render(scale=SCALE).to_pil()
        out_path = OUT_DIR / f"page-{i + 1:02d}.png"
        image.save(out_path, optimize=True)
        print(f"  page {i + 1:02d}: {image.size} -> {out_path.name}")
    print(f"Done. {n} pages rendered to {OUT_DIR}")


if __name__ == "__main__":
    main()
