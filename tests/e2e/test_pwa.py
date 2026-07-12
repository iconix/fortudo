"""PWA E2E checks: manifest, service worker registration, offline reload."""

from __future__ import annotations

from playwright.sync_api import Page, sync_playwright

from scripts.e2e_helpers import dismiss_open_modals, wait_for_main_app, wait_until
from tests.e2e.helpers import BASE_URL, launch_e2e_page, seed_and_enter_room


def wait_for_service_worker(page: Page) -> None:
    """Wait until this page is controlled by an active service worker."""
    wait_until(
        lambda: page.evaluate(
            "navigator.serviceWorker.getRegistration()"
            ".then(r => !!(r && r.active && navigator.serviceWorker.controller))"
        ),
        "service worker active and controlling",
        timeout_s=20.0,
    )


def test_manifest_is_served_and_valid() -> None:
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)
        try:
            page.goto(BASE_URL, wait_until="load")
            response = page.request.get(f"{BASE_URL}/manifest.webmanifest")
            assert response.ok
            assert "application/manifest+json" in response.headers["content-type"]
            manifest = response.json()
            assert manifest["display"] == "standalone"
            assert any(icon["sizes"] == "512x512" for icon in manifest["icons"])
        finally:
            context.close()
            browser.close()


def test_service_worker_registers_and_precaches() -> None:
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)
        try:
            page.goto(BASE_URL, wait_until="load")
            wait_for_service_worker(page)
            cache_names = page.evaluate("caches.keys()")
            assert any(name.startswith("fortudo-shell-") for name in cache_names)
            config_cached = page.evaluate(
                "caches.keys()"
                ".then(keys => caches.open(keys.find(k => k.startsWith('fortudo-shell-'))))"
                ".then(cache => cache.match('/js/config.js'))"
                ".then(hit => !!hit)"
            )
            assert config_cached, "config.js missing from shell cache - offline boot broken"
        finally:
            context.close()
            browser.close()


def test_app_boots_offline_after_first_visit() -> None:
    room_code = "pwa-offline"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)
        try:
            seed_and_enter_room(page, room_code, [])
            wait_for_service_worker(page)

            context.set_offline(True)
            page.reload(wait_until="load")
            wait_for_main_app(page)
            dismiss_open_modals(page)
            assert page.locator("#task-form").is_visible()
        finally:
            context.set_offline(False)
            context.close()
            browser.close()
