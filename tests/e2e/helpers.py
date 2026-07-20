"""Shared helpers for local Playwright E2E tests."""

from __future__ import annotations

import os
import socket
from pathlib import Path

from scripts.e2e_helpers import (
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    launch_browser,
    seed_docs,
    wait_for_main_app,
)

HOST = "127.0.0.1"
REPO_ROOT = Path(__file__).resolve().parents[2]


def choose_port() -> int:
    """Return the configured E2E port or reserve an available local port."""
    configured_port = os.environ.get("FORTUDO_E2E_PORT")
    if configured_port:
        port = int(configured_port)
        if not 1 <= port <= 65535:
            raise ValueError("FORTUDO_E2E_PORT must be between 1 and 65535")
        return port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


PORT = choose_port()
BASE_URL = f"http://{HOST}:{PORT}"
WHATS_NEW_KEY = "fortudo-whats-new-v1"


def launch_e2e_page(playwright, *, viewport: dict | None = None):
    """Launch a browser page for local E2E tests."""
    browser = launch_browser(playwright)
    context = browser.new_context(viewport=viewport or {"width": 1280, "height": 900})
    page = context.new_page()
    page.add_init_script(
        f"""
        (() => {{
            const announcementKey = {WHATS_NEW_KEY!r};
            const clearStorage = Storage.prototype.clear;

            Storage.prototype.clear = function () {{
                clearStorage.call(this);
                if (this === window.localStorage) {{
                    this.setItem(announcementKey, 'dismissed');
                }}
            }};

            window.localStorage.setItem(announcementKey, 'dismissed');
        }})();
        """
    )

    return browser, context, page


def seed_and_enter_room(page, room_code: str, docs: list[dict] | None = None) -> None:
    page.goto(BASE_URL, wait_until="load")
    page.evaluate("localStorage.clear()")
    clear_room_storage(page, room_code)
    seed_docs(page, room_code, docs or [])
    enter_room(page, room_code)
    wait_for_main_app(page)
    dismiss_open_modals(page)


def launch_seeded_page(playwright, room_code: str, docs: list[dict] | None = None):
    browser, context, page = launch_e2e_page(playwright)
    seed_and_enter_room(page, room_code, docs)

    return browser, context, page


def activities_config(*, enabled: bool = True, onboarding_dismissed: bool = True) -> dict:
    return {
        "_id": "config-settings",
        "id": "config-settings",
        "docType": "config",
        "activitiesEnabled": enabled,
        "onboardingDismissed": onboarding_dismissed,
    }


def format_browser_long_date(page, date_value: str) -> str:
    return page.evaluate(
        """
        (dateValue) => new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        })
        """,
        date_value,
    )
