import unittest
from unittest.mock import patch

from scripts.playwright_preview_smoke import (
    assert_migrated_task_docs,
    assert_non_task_docs_remain,
    build_launch_options,
    build_couchdb_request_parts,
    build_remote_db_name,
    clear_all_tasks_via_ui,
    compute_storage_room_code,
    create_run_scoped_prefix,
    create_scenario_rooms,
    delete_unscheduled_task_via_ui,
    derive_smoke_room_prefix,
    extract_couchdb_url,
    fetch_remote_docs,
    fill_locator_value,
    filter_runtime_errors,
    get_hostname_from_url,
    get_unscheduled_delete_state,
    is_expected_sync_response_error,
    is_preview_host,
    open_scheduled_edit_form,
    parse_cli_args,
    summarize_docs,
    task_form_input_selector,
    wait_for_room_code,
    wait_for_text_in_locator,
)


class ComputeStorageRoomCodeTests(unittest.TestCase):
    def test_preview_hosts_are_prefixed(self):
        self.assertEqual(
            compute_storage_room_code("fortudo--pr53-activities-phase2.web.app", "room-a"),
            "preview-room-a",
        )

    def test_non_preview_hosts_are_unchanged(self):
        self.assertEqual(compute_storage_room_code("fortudo.app", "room-a"), "room-a")

    def test_build_remote_db_name_uses_preview_storage_room_code(self):
        self.assertEqual(
            build_remote_db_name("fortudo--pr53-activities-phase2.web.app", "room-a"),
            "fortudo-preview-room-a",
        )


class CouchDbHelpersTests(unittest.TestCase):
    def test_extract_couchdb_url_reads_string_value(self):
        config_text = "export const COUCHDB_URL = 'https://user:pass@example.cloudant.com';"

        self.assertEqual(
            extract_couchdb_url(config_text),
            "https://user:pass@example.cloudant.com",
        )

    def test_extract_couchdb_url_handles_null(self):
        self.assertIsNone(extract_couchdb_url("export const COUCHDB_URL = null;"))

    def test_build_couchdb_request_parts_strips_userinfo_from_base_url(self):
        base_url, headers = build_couchdb_request_parts(
            "https://user:pass@example.cloudant.com"
        )

        self.assertEqual(base_url, "https://example.cloudant.com")
        self.assertIn("Authorization", headers)

    @patch("scripts.playwright_preview_smoke.urlopen")
    def test_fetch_remote_docs_reads_all_docs(self, mock_urlopen):
        mock_response = mock_urlopen.return_value.__enter__.return_value
        mock_response.read.return_value = (
            b'{"rows":[{"doc":{"_id":"task-1","docType":"task","description":"Synced"}}]}'
        )

        docs = fetch_remote_docs(
            "https://user:pass@example.cloudant.com",
            "fortudo-preview-smoke-alpha",
        )

        self.assertEqual(docs, [{"_id": "task-1", "docType": "task", "description": "Synced"}])
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://example.cloudant.com/fortudo-preview-smoke-alpha/_all_docs?include_docs=true",
        )
        self.assertEqual(request.get_method(), "GET")


class SummarizeDocsTests(unittest.TestCase):
    def test_groups_task_legacy_and_non_task_docs(self):
        summary = summarize_docs(
            [
                {"_id": "task-1", "docType": "task", "description": "Task 1"},
                {"_id": "sched-legacy", "type": "scheduled", "description": "Legacy scheduled"},
                {"_id": "activity-1", "docType": "activity", "note": "keep"},
                {"_id": "config-1", "docType": "config", "value": 1},
                {"_id": "misc-1", "kind": "other"},
            ]
        )

        self.assertEqual([doc["id"] for doc in summary["tasks"]], ["task-1"])
        self.assertEqual([doc["id"] for doc in summary["legacy_tasks"]], ["sched-legacy"])
        self.assertEqual([doc["id"] for doc in summary["activities"]], ["activity-1"])
        self.assertEqual([doc["id"] for doc in summary["configs"]], ["config-1"])
        self.assertEqual([doc["id"] for doc in summary["other_docs"]], ["misc-1"])


class SnapshotAssertionTests(unittest.TestCase):
    def test_assert_migrated_task_docs_accepts_fully_migrated_snapshot(self):
        summary = summarize_docs(
            [
                {"_id": "sched-legacy", "docType": "task", "description": "Migrated scheduled"},
                {"_id": "unsched-legacy", "docType": "task", "description": "Migrated unscheduled"},
            ]
        )

        assert_migrated_task_docs(summary, ["sched-legacy", "unsched-legacy"])

    def test_assert_migrated_task_docs_rejects_remaining_legacy_docs(self):
        summary = summarize_docs(
            [
                {"_id": "sched-legacy", "type": "scheduled", "description": "Legacy scheduled"},
                {"_id": "unsched-legacy", "docType": "task", "description": "Migrated unscheduled"},
            ]
        )

        with self.assertRaisesRegex(ValueError, "legacy task docs remain"):
            assert_migrated_task_docs(summary, ["sched-legacy", "unsched-legacy"])

    def test_assert_non_task_docs_remain_accepts_isolated_snapshot(self):
        summary = summarize_docs(
            [
                {"_id": "activity-smoke", "docType": "activity", "note": "keep me"},
                {"_id": "config-categories", "docType": "config", "categories": []},
            ]
        )

        assert_non_task_docs_remain(
            summary,
            {
                "activity_id": "activity-smoke",
                "config_id": "config-categories",
            },
        )

    def test_assert_non_task_docs_remain_rejects_leaked_tasks(self):
        summary = summarize_docs(
            [
                {"_id": "task-1", "docType": "task", "description": "should not exist"},
                {"_id": "activity-smoke", "docType": "activity", "note": "keep me"},
                {"_id": "config-categories", "docType": "config", "categories": []},
            ]
        )

        with self.assertRaisesRegex(ValueError, "unexpected task docs remain"):
            assert_non_task_docs_remain(
                summary,
                {
                    "activity_id": "activity-smoke",
                    "config_id": "config-categories",
                },
            )

    def test_filter_runtime_errors_ignores_expected_sync_abort_noise(self):
        filtered_console_errors, filtered_request_failures, filtered_response_errors = (
            filter_runtime_errors(
                [
                    "[sync-manager.js:91] Sync error: n",
                    "Failed to load resource: the server responded with a status of 404 ()",
                ],
                [
                    "GET https://example.cloudant.com/fortudo-preview-alpha/ net::ERR_ABORTED",
                ],
                [],
            )
        )

        self.assertEqual(filtered_console_errors, [])
        self.assertEqual(filtered_request_failures, [])
        self.assertEqual(filtered_response_errors, [])

    def test_filter_runtime_errors_ignores_expected_sync_response_noise(self):
        filtered_console_errors, filtered_request_failures, filtered_response_errors = (
            filter_runtime_errors(
                [
                    "Failed to load resource: the server responded with a status of 404 ()",
                    "Failed to load resource: the server responded with a status of 412 ()",
                ],
                [],
                [
                    (404, "GET", "https://example.cloudant.com/fortudo-preview-alpha/"),
                    (412, "PUT", "https://example.cloudant.com/fortudo-preview-alpha/"),
                ],
            )
        )

        self.assertEqual(filtered_console_errors, [])
        self.assertEqual(filtered_request_failures, [])
        self.assertEqual(filtered_response_errors, [])

    def test_filter_runtime_errors_keeps_non_abort_failures(self):
        filtered_console_errors, filtered_request_failures, filtered_response_errors = (
            filter_runtime_errors(
                ["[sync-manager.js:91] Sync error: n"],
                ["GET https://example.cloudant.com/fortudo-preview-alpha/ 403 Forbidden"],
                [],
            )
        )

        self.assertEqual(filtered_console_errors, ["[sync-manager.js:91] Sync error: n"])
        self.assertEqual(
            filtered_request_failures,
            ["GET https://example.cloudant.com/fortudo-preview-alpha/ 403 Forbidden"],
        )
        self.assertEqual(filtered_response_errors, [])

    def test_expected_sync_response_error_accepts_known_cloudant_noise(self):
        self.assertTrue(
            is_expected_sync_response_error(
                (404, "GET", "https://example.cloudant.com/fortudo-preview-alpha/")
            )
        )
        self.assertTrue(
            is_expected_sync_response_error(
                (
                    404,
                    "GET",
                    "https://example.cloudant.com/fortudo-preview-alpha/_local/checkpoint",
                )
            )
        )
        self.assertTrue(
            is_expected_sync_response_error(
                (412, "PUT", "https://example.cloudant.com/fortudo-preview-alpha/")
            )
        )

    def test_expected_sync_response_error_rejects_unexpected_responses(self):
        self.assertFalse(
            is_expected_sync_response_error(
                (412, "PUT", "https://example.cloudant.com/js/app.js")
            )
        )
        self.assertFalse(
            is_expected_sync_response_error(
                (403, "GET", "https://example.cloudant.com/fortudo-preview-alpha/")
            )
        )


class CliHelpersTests(unittest.TestCase):
    def test_parse_cli_args_defaults_to_visible_chrome(self):
        parsed = parse_cli_args(["https://example.test"])

        self.assertFalse(parsed["help"])
        self.assertFalse(parsed["keep_open"])
        self.assertFalse(parsed["headless"])
        self.assertEqual(parsed["channel"], "chrome")
        self.assertEqual(parsed["preview_url"], "https://example.test")

    def test_parse_cli_args_honors_flags(self):
        parsed = parse_cli_args(
            ["--headless", "--keep-open", "--channel", "chromium", "https://example.test"]
        )

        self.assertTrue(parsed["keep_open"])
        self.assertTrue(parsed["headless"])
        self.assertEqual(parsed["channel"], "chromium")

    def test_parse_cli_args_demo_mode_sets_visible_demo_defaults(self):
        parsed = parse_cli_args(["--demo", "https://example.test"])

        self.assertTrue(parsed["demo"])
        self.assertTrue(parsed["keep_open"])
        self.assertFalse(parsed["headless"])
        self.assertEqual(parsed["slow_mo_ms"], 600)
        self.assertEqual(parsed["step_pause_ms"], 900)

    def test_parse_cli_args_demo_mode_allows_overrides(self):
        parsed = parse_cli_args(
            ["--demo", "--slow-ms", "1200", "--step-pause-ms", "1500", "https://example.test"]
        )

        self.assertEqual(parsed["slow_mo_ms"], 1200)
        self.assertEqual(parsed["step_pause_ms"], 1500)

    def test_build_launch_options_adds_demo_slow_mo_for_visible_chrome(self):
        launch_options = build_launch_options(headless=False, channel="chrome", slow_mo_ms=600)

        self.assertEqual(
            launch_options,
            {"headless": False, "channel": "chrome", "slow_mo": 600},
        )

    def test_build_launch_options_omits_channel_for_plain_chromium(self):
        launch_options = build_launch_options(headless=True, channel="chromium", slow_mo_ms=0)

        self.assertEqual(launch_options, {"headless": True})

    def test_hostname_and_room_prefix_helpers(self):
        hostname = get_hostname_from_url("https://fortudo--pr53-activities-phase2-x.web.app")
        self.assertEqual(hostname, "fortudo--pr53-activities-phase2-x.web.app")
        self.assertTrue(is_preview_host(hostname))
        self.assertEqual(
            derive_smoke_room_prefix(hostname),
            "pr53-activities-phase2-x",
        )

        rooms = create_scenario_rooms("preview-pr53-smoke")
        self.assertEqual(
            rooms,
            {
                "alpha": "preview-pr53-smoke-alpha",
                "legacy": "preview-pr53-smoke-legacy",
                "beta": "preview-pr53-smoke-beta",
            },
        )

        scoped = create_run_scoped_prefix(hostname)
        self.assertEqual(scoped, "pr53-activities-phase2-x-smoke")

    def test_non_preview_hosts_keep_unique_scoped_prefixes(self):
        scoped = create_run_scoped_prefix("127.0.0.1")
        self.assertTrue(scoped.startswith("smoke-"))

    def test_task_form_input_selector_scopes_to_add_task_form(self):
        self.assertEqual(
            task_form_input_selector("description"),
            '#task-form input[name="description"]',
        )


class FakeLocator:
    def __init__(
        self,
        *,
        visible: bool = True,
        count: int = 1,
        classes: str | None = None,
        text_values: list[str] | None = None,
    ):
        self.visible = visible
        self._count = count
        self.classes = classes or ""
        self.text_values = list(text_values or [])
        self.wait_failures_before_visible = 0
        self.wait_failures_before_hidden = 0
        self.fill_failures_before_sticks = 0
        self.scroll_failures_before_success = 0
        self.clicks = 0
        self.scrolls = 0
        self.wait_calls = 0
        self.evaluate_calls = 0
        self.value = ""
        self.first = self

    def count(self):
        return self._count

    def is_visible(self):
        return self.visible

    def wait_for(self, *, state, timeout):
        self.wait_calls += 1
        if state == "visible":
            if self.wait_failures_before_visible > 0:
                self.wait_failures_before_visible -= 1
                raise TimeoutError(f"not visible within {timeout}")
            self.visible = True
            return
        if state == "hidden":
            if self.wait_failures_before_hidden > 0:
                self.wait_failures_before_hidden -= 1
                raise TimeoutError(f"not hidden within {timeout}")
            self.visible = False
            return
        raise AssertionError(f"unexpected wait state {state}")

    def scroll_into_view_if_needed(self):
        if self.scroll_failures_before_success > 0:
            self.scroll_failures_before_success -= 1
            raise RuntimeError("Element is not attached to the DOM")
        self.scrolls += 1

    def click(self):
        self.clicks += 1

    def evaluate(self, _script):
        self.evaluate_calls += 1
        self.clicks += 1

    def fill(self, value):
        if self.fill_failures_before_sticks > 0:
            self.fill_failures_before_sticks -= 1
            self.value = ""
            return
        self.value = value

    def input_value(self):
        return self.value

    def get_attribute(self, name):
        if name != "class":
            raise AssertionError(f"unexpected attribute {name}")
        return self.classes

    def text_content(self):
        if self.text_values:
            if len(self.text_values) > 1:
                return self.text_values.pop(0)
            return self.text_values[0]
        return ""


class FakePage:
    def __init__(self, locators):
        self._locators = locators
        self.waits = []

    def locator(self, selector):
        locator = self._locators.get(selector)
        if locator is None:
            raise AssertionError(f"unexpected selector {selector}")
        return locator

    def wait_for_timeout(self, timeout_ms):
        self.waits.append(timeout_ms)


class DeleteStatePage(FakePage):
    def __init__(self, task_id):
        self.task_id = task_id
        self.state = "idle"
        self.button = FakeLocator(classes="btn-delete-unscheduled text-gray-400")
        self.icon = FakeLocator(classes="fa-regular fa-trash-can")
        self.card = FakeLocator()
        super().__init__({})

    def locator(self, selector):
        task_selector = f'.task-card[data-task-id="{self.task_id}"]'
        if selector == task_selector:
            self.card._count = 0 if self.state == "deleted" else 1
            return self.card
        if selector == f"{task_selector} .btn-delete-unscheduled":
            self.button.classes = (
                "btn-delete-unscheduled text-rose-400"
                if self.state == "confirming"
                else "btn-delete-unscheduled text-gray-400"
            )
            return self.button
        if selector == f"{task_selector} .btn-delete-unscheduled i":
            self.icon.classes = (
                "fa-regular fa-check-circle"
                if self.state == "confirming"
                else "fa-regular fa-trash-can"
            )
            return self.icon
        raise AssertionError(f"unexpected selector {selector}")


class PreviewWaitHelperTests(unittest.TestCase):
    def test_wait_for_room_code_waits_for_exact_room_match(self):
        page = FakePage(
            {
                "#room-code-display": FakeLocator(
                    text_values=["preview-smoke-alpha", "preview-smoke-legacy"]
                )
            }
        )

        wait_for_room_code(page, "preview-smoke-legacy", timeout_s=0.05, interval_s=0)

    def test_open_scheduled_edit_form_retries_until_form_is_visible(self):
        task_id = "sched-123"
        button_selector = f'[data-task-id="{task_id}"] .btn-edit'
        form_selector = f"#edit-task-{task_id}"
        button = FakeLocator()
        form = FakeLocator(visible=False)
        form.wait_failures_before_visible = 1
        page = FakePage({button_selector: button, form_selector: form})

        selector = open_scheduled_edit_form(
            page, task_id, attempts=3, form_timeout_ms=5, retry_delay_ms=0
        )

        self.assertEqual(selector, form_selector)
        self.assertEqual(button.clicks, 2)
        self.assertEqual(button.scrolls, 2)
        self.assertEqual(form.wait_calls, 2)

    def test_open_scheduled_edit_form_retries_after_transient_detach(self):
        task_id = "sched-detached"
        button_selector = f'[data-task-id="{task_id}"] .btn-edit'
        form_selector = f"#edit-task-{task_id}"
        button = FakeLocator()
        button.scroll_failures_before_success = 1
        form = FakeLocator(visible=False)
        page = FakePage({button_selector: button, form_selector: form})

        selector = open_scheduled_edit_form(
            page, task_id, attempts=3, form_timeout_ms=5, retry_delay_ms=0
        )

        self.assertEqual(selector, form_selector)
        self.assertEqual(button.clicks, 1)

    def test_get_unscheduled_delete_state_detects_confirmation_icon(self):
        page = DeleteStatePage("unsched-123")
        page.state = "confirming"

        self.assertEqual(get_unscheduled_delete_state(page, "unsched-123"), "confirming")

    def test_delete_unscheduled_task_via_ui_waits_for_confirm_state_before_second_click(self):
        task_id = "unsched-123"
        page = DeleteStatePage(task_id)

        original_click = page.button.click

        def click_and_advance():
            original_click()
            if page.state == "idle":
                page.state = "confirming"
            elif page.state == "confirming":
                page.state = "deleted"

        page.button.click = click_and_advance

        delete_unscheduled_task_via_ui(page, task_id, timeout_s=0.05, interval_s=0)

        self.assertEqual(page.button.clicks, 2)
        self.assertEqual(page.state, "deleted")

    def test_clear_all_tasks_via_ui_waits_for_dropdown_and_confirm_modal(self):
        trigger = FakeLocator()
        option = FakeLocator(visible=False)
        confirm_button = FakeLocator()
        confirm_modal = FakeLocator()
        option.wait_failures_before_visible = 1
        confirm_button.wait_failures_before_visible = 1
        page = FakePage(
            {
                "#clear-options-dropdown-trigger-btn": trigger,
                "#clear-all-tasks-option": option,
                "#ok-custom-confirm-modal": confirm_button,
                "#custom-confirm-modal": confirm_modal,
            }
        )

        clear_all_tasks_via_ui(page, option_timeout_ms=5, confirm_timeout_ms=5)

        self.assertGreaterEqual(trigger.clicks, 2)
        self.assertEqual(option.clicks, 1)
        self.assertEqual(confirm_button.clicks, 1)
        self.assertGreaterEqual(option.wait_calls, 1)
        self.assertGreaterEqual(confirm_button.wait_calls, 1)
        self.assertGreaterEqual(confirm_modal.wait_calls, 1)

    def test_clear_all_tasks_via_ui_falls_back_to_programmatic_option_click(self):
        trigger = FakeLocator()
        option = FakeLocator(visible=False)
        option.wait_failures_before_visible = 3
        confirm_button = FakeLocator()
        confirm_modal = FakeLocator()
        page = FakePage(
            {
                "#clear-options-dropdown-trigger-btn": trigger,
                "#clear-all-tasks-option": option,
                "#ok-custom-confirm-modal": confirm_button,
                "#custom-confirm-modal": confirm_modal,
            }
        )

        clear_all_tasks_via_ui(
            page,
            option_timeout_ms=5,
            confirm_timeout_ms=5,
            attempts=3,
            retry_delay_ms=0,
        )

        self.assertEqual(option.evaluate_calls, 1)
        self.assertEqual(confirm_button.clicks, 1)

    def test_fill_locator_value_retries_until_input_matches(self):
        page = FakePage({})
        locator = FakeLocator()
        locator.fill_failures_before_sticks = 1

        fill_locator_value(
            page,
            locator,
            "Playwright beta task",
            description="beta task description",
            retry_delay_ms=0,
        )

        self.assertEqual(locator.value, "Playwright beta task")

    def test_wait_for_text_in_locator_waits_for_expected_text(self):
        page = FakePage({"#scheduled-task-list": FakeLocator(text_values=["Loading", "Edited task"])})

        wait_for_text_in_locator(
            page,
            "#scheduled-task-list",
            "Edited task",
            description="scheduled task list",
            timeout_s=0.05,
            interval_s=0,
        )


if __name__ == "__main__":
    unittest.main()
