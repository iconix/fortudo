"""Module entrypoint for the preview smoke runner."""

from __future__ import annotations

import sys

from scripts.preview_smoke.runner import main


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
