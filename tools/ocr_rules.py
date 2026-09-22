"""OCR all rendered rule pages and write a markdown transcript.

Output: docs/rules_raw.md
RapidOCR can become unstable after several large pages, so each page is
processed in a fresh subprocess and the result is appended immediately.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

PAGES_DIR = Path(__file__).resolve().parent / "pages"
OUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "rules_raw.md"
PREPROC_DIR = Path(__file__).resolve().parent / "pages_preproc"


def preprocess(src: Path, dst: Path) -> None:
    """Dark-blue PDF pages: invert after greyscale so text is dark on light."""
    img = Image.open(src).convert("L")
    img = ImageOps.autocontrast(img)
    img = ImageOps.invert(img)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, optimize=True)


def ocr_page_subprocess(proc_path: Path, python: Path) -> tuple[list[str], str]:
    """Run OCR in a fresh interpreter, return (texts, timing)."""
    script_path = Path(__file__).resolve().parent / "_ocr_one_page.py"
    out_json = Path(tempfile.gettempdir()) / f"solstice_ocr_{proc_path.stem}.json"
    out_json.unlink(missing_ok=True)

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["SOLSTICE_OCR_OUT"] = str(out_json)

    cmd = [str(python), str(script_path), str(proc_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if proc.returncode != 0:
        raise RuntimeError(f"OCR subprocess failed: {proc.stderr.strip() or proc.stdout.strip()}")

    data = json.loads(out_json.read_text(encoding="utf-8"))
    out_json.unlink(missing_ok=True)
    return data["texts"], data["timing"]


def main() -> None:
    python = Path(sys.executable)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    # overwrite with header
    OUT_PATH.write_text("# 宇宙星尘 - 规则 OCR 原始文本\n" f"来源：{PAGES_DIR}\n", encoding="utf-8")

    page_files = sorted(PAGES_DIR.glob("page-*.png"))
    for path in page_files:
        print(f"OCR {path.name} ...")
        proc_path = PREPROC_DIR / path.name
        preprocess(path, proc_path)
        try:
            texts, timing = ocr_page_subprocess(proc_path, python)
        except Exception as exc:
            print(f"  FAILED: {exc}")
            texts, timing = [], "failed"
        with OUT_PATH.open("a", encoding="utf-8") as f:
            f.write(f"\n## {path.name}\n")
            f.write(f"<!-- OCR time: {timing} -->\n")
            if not texts:
                f.write("*（本页未识别到文本）*\n")
            else:
                for t in texts:
                    f.write(f"{t}\n")

    print(f"Wrote {len(page_files)} pages OCR to {OUT_PATH}")


if __name__ == "__main__":
    main()
