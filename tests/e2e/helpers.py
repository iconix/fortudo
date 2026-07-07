"""Shared helpers for local Playwright E2E tests."""

from __future__ import annotations

from pathlib import Path

from scripts.e2e_helpers import (
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    install_local_pouchdb_route,
    launch_browser,
    seed_docs,
    wait_for_main_app,
)

PORT = 9847
HOST = "127.0.0.1"
REPO_ROOT = Path(__file__).resolve().parents[2]
BASE_URL = f"http://{HOST}:{PORT}"


def seed_and_enter_room(page, room_code: str, docs: list[dict] | None = None) -> None:
    page.goto(BASE_URL, wait_until="load")
    page.evaluate("localStorage.clear()")
    clear_room_storage(page, room_code)
    seed_docs(page, room_code, docs or [])
    enter_room(page, room_code)
    wait_for_main_app(page)
    dismiss_open_modals(page)


def launch_seeded_page(playwright, room_code: str, docs: list[dict] | None = None):
    browser = launch_browser(playwright)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    install_local_pouchdb_route(context, repo_root=REPO_ROOT)
    page = context.new_page()
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
