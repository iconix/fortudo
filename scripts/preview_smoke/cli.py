"""CLI parsing and browser launch options for preview smoke runs."""

from __future__ import annotations

import argparse
from typing import Any


def parse_cli_args(argv: list[str]) -> dict[str, Any]:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.preview_smoke",
        description="Run a visible Playwright storage smoke against a Fortudo preview URL.",
    )
    parser.add_argument("preview_url", nargs="?")
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--keep-open", action="store_true", dest="keep_open")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--slow-ms", type=int, default=0, dest="slow_mo_ms")
    parser.add_argument("--step-pause-ms", type=int, default=0, dest="step_pause_ms")
    parser.add_argument(
        "--channel",
        choices=("chrome", "chromium"),
        default="chrome",
        help="Browser channel to use. Defaults to installed Chrome.",
    )
    parsed = parser.parse_args(argv)
    keep_open = parsed.keep_open
    headless = parsed.headless
    slow_mo_ms = parsed.slow_mo_ms
    step_pause_ms = parsed.step_pause_ms

    if parsed.demo:
        keep_open = True
        headless = False
        if slow_mo_ms == 0:
            slow_mo_ms = 600
        if step_pause_ms == 0:
            step_pause_ms = 900

    return {
        "help": False,
        "preview_url": parsed.preview_url,
        "demo": parsed.demo,
        "keep_open": keep_open,
        "headless": headless,
        "slow_mo_ms": slow_mo_ms,
        "step_pause_ms": step_pause_ms,
        "channel": parsed.channel,
    }


def build_launch_options(*, headless: bool, channel: str, slow_mo_ms: int = 0) -> dict[str, Any]:
    launch_options: dict[str, Any] = {"headless": headless}
    if channel != "chromium":
        launch_options["channel"] = channel
    if slow_mo_ms > 0:
        launch_options["slow_mo"] = slow_mo_ms
    return launch_options
