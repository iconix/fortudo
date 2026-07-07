"""Compatibility wrapper for the preview smoke runner.

Prefer: python -m scripts.preview_smoke <preview-url> --channel chrome
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.preview_smoke.runner import main


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
