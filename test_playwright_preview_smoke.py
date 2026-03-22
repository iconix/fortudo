import unittest

from scripts.playwright_preview_smoke import (
    assert_migrated_task_docs,
    assert_non_task_docs_remain,
    build_couchdb_request_parts,
    build_remote_db_name,
    compute_storage_room_code,
    create_run_scoped_prefix,
    create_scenario_rooms,
    derive_smoke_room_prefix,
    extract_couchdb_url,
    get_hostname_from_url,
    is_preview_host,
    parse_cli_args,
    summarize_docs,
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
        config_text = (
            "export const COUCHDB_URL = "
            "'https://user:pass@example.cloudant.com';"
        )

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


if __name__ == "__main__":
    unittest.main()
