"""Shared helpers for local Playwright E2E tests."""

from __future__ import annotations

import os
from typing import Any

from scripts.playwright_preview_smoke import (
    assert_trend_day_selection_scopes_details,
    build_relative_day_activity_doc,
    build_relative_day_scheduled_task_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    force_activity_mode,
    install_local_pouchdb_route,
    open_settings_modal,
    open_scheduled_edit_form,
    read_docs,
    seed_docs,
    start_activity_timer,
    wait_for_main_app,
    wait_for_running_activity_config,
    wait_for_running_timer_ui,
    wait_until,
)

BROWSER_CHANNEL = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")


def launch_browser(playwright: Any):
    """Launch chromium; set E2E_BROWSER_CHANNEL=chrome to use system Chrome instead."""
    options: dict[str, Any] = {"headless": True}
    if BROWSER_CHANNEL != "chromium":
        options["channel"] = BROWSER_CHANNEL
    return playwright.chromium.launch(**options)
