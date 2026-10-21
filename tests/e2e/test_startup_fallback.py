"""The HTML shell remains usable when the JavaScript app cannot load."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page


@pytest.mark.parametrize("failure", ["app", "dependency", "guard"])
def test_failed_boot_can_reload_without_losing_local_data(app_server, failure):
    with sync_playwright() as p:
        browser, context, page = launch_e2e_page(
            p, viewport={"width": 390, "height": 844},
            context_options={"service_workers": "block"},
        )
        try:
            page.route("**/js/config.js", lambda route: route.fulfill(
                content_type="application/javascript", body="export const COUCHDB_URL = null;"
            ))
            path = "utils.js" if failure == "dependency" else "app.js"
            page.route(f"**/js/{path}", lambda route: route.abort("connectionreset"))
            if failure == "guard":
                page.route("**/js/startup-fallback.js", lambda route: route.abort("connectionreset"))
            url = BASE_URL + "/?startup-example=preserve"
            page.goto(url)
            fallback = page.locator("#startup-fallback")
            expect(fallback).to_be_visible()
            if failure != "guard":
                expect(fallback).to_contain_text("Fortudo couldn’t load")
                expect(fallback).to_have_attribute("data-visible", "true")
            expect(fallback.get_by_role("link", name="Reload", exact=True)).to_be_visible()
            page.evaluate("""async () => {
                sessionStorage.setItem('fortudo-task-draft:example', 'preserved draft');
                const db = new PouchDB('fallback-test-data');
                await db.put({_id:'example',description:'Preserved task'});
                await db.close();
            }""")
            if failure == "app":
                directory = REPO_ROOT / "test_screenshots"
                directory.mkdir(exist_ok=True)
                page.screenshot(path=str(directory / "startup-fallback-mobile.png"))
            page.unroute(f"**/js/{path}")
            if failure == "guard":
                page.unroute("**/js/startup-fallback.js")
            with page.expect_navigation():
                fallback.get_by_role("link", name="Reload", exact=True).click()
            expect(page.locator("#room-entry-screen")).to_be_visible()
            expect(fallback).to_have_count(0)
            assert page.url == url
            assert page.evaluate("sessionStorage.getItem('fortudo-task-draft:example')") == "preserved draft"
            assert page.evaluate("""async () => {
                const db = new PouchDB('fallback-test-data');
                const task = await db.get('example'); await db.close(); return task.description;
            }""") == "Preserved task"
        finally:
            context.close()
            browser.close()


def test_static_fallback_works_without_javascript(app_server):
    with sync_playwright() as p:
        browser, context, page = launch_e2e_page(p, context_options={"java_script_enabled": False})
        try:
            page.goto(BASE_URL)
            expect(page.locator("#startup-fallback")).to_be_visible()
            expect(page.get_by_text("Enable JavaScript to use Fortudo.", exact=True)).to_be_visible()
            expect(page.get_by_role("link", name="Reload", exact=True)).to_be_visible()
        finally:
            context.close()
            browser.close()


@pytest.mark.parametrize("helper_available", [True, False])
def test_loading_reveal_waits_500ms_even_without_helper(app_server, helper_available):
    with sync_playwright() as p:
        browser, context, page = launch_e2e_page(p, context_options={"service_workers": "block"})
        pending = []
        try:
            page.route("**/js/app.js", lambda route: pending.append(route))
            if not helper_available:
                page.route("**/js/startup-fallback.js", lambda route: route.abort("connectionreset"))
            page.goto(BASE_URL, wait_until="commit")
            fallback = page.locator("#startup-fallback")
            fallback.wait_for(state="attached")
            # Control the CSS animation timeline so the threshold is deterministic,
            # rather than depending on machine speed or JavaScript's timer clock.
            fallback.evaluate("node => { const a = node.getAnimations()[0]; a.pause(); a.currentTime = 0; }")
            expect(fallback).to_be_hidden()
            fallback.evaluate("node => { node.getAnimations()[0].currentTime = 499; }")
            expect(fallback).to_be_hidden()
            fallback.evaluate("node => { node.getAnimations()[0].currentTime = 501; }")
            expect(fallback).to_be_visible()
            expect(fallback.get_by_role("link", name="Reload", exact=True)).to_be_visible()
        finally:
            for route in pending:
                route.abort()
            context.close()
            browser.close()
