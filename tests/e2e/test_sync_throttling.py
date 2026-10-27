"""Exercise real browser replication against a disposable, in-memory HTTP fixture."""

import json
from urllib.parse import parse_qs, unquote, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from scripts.document_contract_ops import load_design_document
from tests.e2e.helpers import BASE_URL, launch_e2e_page


@pytest.mark.parametrize("failures", [1, 4])
def test_throttled_download_keeps_bulk_reads_and_existing_sync_badge(app_server, failures):
    cloud_origin = "https://sync-fixture.cloudantnosqldb.appdomain.cloud"
    database = "fortudo-sync-throttling"
    design = {**load_design_document(), "_rev": "1-" + "a" * 32}
    documents = {design["_id"]: design}
    for index in range(45):
        document = {
            "_id": f"cloud-task-{index}", "_rev": "1-" + "b" * 32,
            "docType": "task", "type": "unscheduled", "description": f"Cloud task {index}",
            "status": "incomplete", "priority": "normal", "estDuration": 15,
            "category": None, "categoryId": None, "categoryIdentityVersion": None,
            "writerContract": {"version": 1, "categoryReference": None},
        }
        documents[document["_id"]] = document
    changes = [
        {"seq": index, "id": document["_id"], "changes": [{"rev": document["_rev"]}]}
        for index, document in enumerate(documents.values(), start=1)
    ]
    checkpoints = {}
    bulk_sizes = []
    individual_task_reads = []

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": 390, "height": 844},
            context_options={"service_workers": "block"},
        )

        def cloud(route):
            request = route.request
            parsed = urlsplit(request.url)
            parts = unquote(parsed.path).strip("/").split("/", 1)
            operation = parts[1] if len(parts) > 1 else ""
            query = parse_qs(parsed.query)
            body = request.post_data_json if request.post_data else {}
            headers = {
                "Access-Control-Allow-Origin": BASE_URL,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Headers": "authorization,content-type",
                "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
                "Access-Control-Expose-Headers": "Retry-After",
            }

            def reply(value, status=200):
                route.fulfill(status=status, headers=headers, content_type="application/json",
                              body=json.dumps(value))

            if request.method == "OPTIONS":
                reply({})
            elif not parsed.path.strip("/"):
                reply({"uuid": "fixture-account"})
            elif not operation:
                reply({"db_name": database, "doc_count": len(documents),
                       "update_seq": len(changes), "uuid": "fixture-database"})
            elif operation.startswith("_local/"):
                if request.method == "PUT":
                    checkpoints[operation] = {**body, "_rev": "1-" + "c" * 32}
                    reply({"ok": True, "id": operation, "rev": checkpoints[operation]["_rev"]})
                elif operation in checkpoints:
                    reply(checkpoints[operation])
                else:
                    reply({"error": "not_found", "reason": "missing"}, 404)
            elif operation == "_changes":
                since = int(query.get("since", ["0"])[0])
                limit = int(query.get("limit", ["100"])[0])
                rows = [row for row in changes if row["seq"] > since][:limit]
                last = rows[-1]["seq"] if rows else len(changes)
                reply({"results": rows, "last_seq": last, "pending": len(changes) - last})
            elif operation == "_revs_diff":
                reply({key: {"missing": [rev for rev in revisions
                       if documents.get(key, {}).get("_rev") != rev]}
                       for key, revisions in body.items()
                       if any(documents.get(key, {}).get("_rev") != rev for rev in revisions)})
            elif operation == "_bulk_docs":
                for document in body["docs"]:
                    documents[document["_id"]] = document
                    changes.append({"seq": len(changes) + 1, "id": document["_id"],
                                    "changes": [{"rev": document["_rev"]}]})
                reply([{"ok": True, "id": doc["_id"], "rev": doc["_rev"]}
                       for doc in body["docs"]])
            elif operation == "_bulk_get":
                bulk_sizes.append(len(body["docs"]))
                if len(bulk_sizes) <= failures:
                    reply({"error": "too_many_requests", "reason": "fixture read capacity"}, 429)
                elif len(body["docs"]) > 20:
                    reply({"error": "too_many_requests", "reason": "fixture batch ceiling"}, 429)
                else:
                    reply({"results": [{"id": doc["id"], "docs": [{"ok": documents[doc["id"]]}]}
                                       for doc in body["docs"]]})
            elif operation in documents:
                if operation.startswith("cloud-task-"):
                    individual_task_reads.append(operation)
                reply(documents[operation])
            else:
                reply({"error": "not_found", "reason": "missing"}, 404)

        context.route(f"{cloud_origin}/**", cloud)
        page.route("**/js/config.js", lambda route: route.fulfill(
            content_type="application/javascript",
            body="export const COUCHDB_URL = 'https://test:test@"
                 "sync-fixture.cloudantnosqldb.appdomain.cloud';",
        ))
        try:
            page.goto(BASE_URL)
            page.locator("#room-code-input").fill("sync-throttling")
            page.locator('#room-entry-form button[type="submit"]').click()
            if failures == 4:
                expect(page.locator("#sync-status-text")).to_have_text("Error", timeout=20000)
                assert len(bulk_sizes) == 4
                expect(page.locator("#cloud-loading-notice")).to_have_count(0)
                page.locator("#sync-status-indicator").click()
            expect(page.locator("#unscheduled-task-list")).to_contain_text("Cloud task 44", timeout=20000)
            expect(page.locator("#sync-status-text")).to_have_text("Synced", timeout=20000)
            expect(page.locator("#cloud-loading-notice")).to_have_count(0)
            assert max(bulk_sizes) <= 20
            assert len(bulk_sizes) >= failures + 3
            assert individual_task_reads == []
            assert not page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        finally:
            context.close()
            browser.close()
