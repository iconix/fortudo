"""Pytest fixtures for local Playwright E2E tests."""

from __future__ import annotations

import http.client
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

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
PUBLIC_DIR = REPO_ROOT / "public"
BASE_URL = f"http://{HOST}:{PORT}"


def is_port_in_use(port: int) -> bool:
    """Return true when a TCP port is already bound on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex((HOST, port)) == 0


def wait_for_server(port: int, timeout: float = 10.0) -> bool:
    """Wait until the local app server responds with the app index."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection(HOST, port, timeout=1)
            conn.request("GET", "/")
            response = conn.getresponse()
            body = response.read().decode("utf-8", errors="ignore")
            conn.close()
            if response.status == 200 and "task-form" in body:
                return True
        except (ConnectionRefusedError, OSError):
            pass
        time.sleep(0.3)
    return False


@pytest.fixture(scope="session", autouse=True)
def app_server():
    """Serve the app for E2E tests unless explicit server reuse is requested."""
    reuse_existing = os.environ.get("FORTUDO_E2E_REUSE_SERVER") == "1"
    if is_port_in_use(PORT):
        if reuse_existing and wait_for_server(PORT):
            yield
            return
        raise RuntimeError(
            f"Port {PORT} is already in use. Stop that server or set "
            "FORTUDO_E2E_REUSE_SERVER=1 to intentionally reuse it."
        )

    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", HOST],
        cwd=PUBLIC_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_for_server(PORT):
            process.kill()
            raise RuntimeError(f"Server failed to start on port {PORT}.")
        yield
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


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
