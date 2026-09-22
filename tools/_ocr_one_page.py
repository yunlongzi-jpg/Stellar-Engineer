"""Single-page OCR worker, called by ocr_rules.py in a subprocess."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR


def main() -> None:
    proc_path = Path(sys.argv[1])
    out_json = Path(os.environ.get("SOLSTICE_OCR_OUT", "ocr_out.json"))
    engine = RapidOCR()
    result, elapse = engine(str(proc_path))
    if isinstance(elapse, (list, tuple)):
        timing = " / ".join(f"{e:.3f}s" if isinstance(e, float) else str(e) for e in elapse)
    else:
        timing = f"{elapse:.3f}s" if isinstance(elapse, float) else str(elapse)
    texts = [text for box, text, score in result] if result else []
    out_json.write_text(json.dumps({"texts": texts, "timing": timing}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
