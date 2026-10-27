"""Exercise real browser replication against a disposable, in-memory HTTP fixture."""

import json
import time
from collections import deque
from urllib.parse import parse_qs, unquote, urlsplit

import pytest
from playwright.sync_api import expect, sync_playwright

from scripts.document_contract_ops import load_design_document
from tests.e2e.helpers import BASE_URL, launch_e2e_page


@pytest.mark.parametrize(
    ("failures", "capacity", "competing_reads"),
    [
        pytest.param(1, False, 0, id="transient"),
        pytest.param(4, False, 0, id="exhausted"),
        pytest.param(0, True, 0, id="sliding-capacity"),
        pytest.param(0, True, 4, id="shared-sliding-capacity"),
    ],
)
def test_throttled_download_keeps_bulk_reads_and_existing_sync_badge(
    app_server, failures, capacity, competing_reads
):
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
    read_times = deque()
    next_competing_read = time.monotonic()
    capacity_denials = []
    accepted_bulk_reads = []

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": 390, "height": 844},
            context_options={"service_workers": "block"},
        )

        def cloud(route):
            nonlocal next_competing_read
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

            # Model document reads, including the contract lookup, against a sliding
            # second shared with an independent four-document/sec workload. This is
            # a local capacity model, not a replay of the historical production 429.
            if capacity and request.method != "OPTIONS":
                now = time.monotonic()
                if competing_reads:
                    while next_competing_read <= now:
                        while read_times and read_times[0] <= next_competing_read - 1:
                            read_times.popleft()
                        if len(read_times) < 20:
                            read_times.append(next_competing_read)
                        next_competing_read += 1 / competing_reads
                while read_times and read_times[0] <= now - 1:
                    read_times.popleft()
                cost = len(body["docs"]) if operation == "_bulk_get" else int(
                    request.method == "GET" and operation in documents
                )
                if cost and len(read_times) + cost > 20:
                    capacity_denials.append({"requested": cost, "used": len(read_times)})
                    reply({"error": "too_many_requests", "reason": "sliding read capacity"}, 429)
                    return
                read_times.extend([now] * cost)
                if operation == "_bulk_get":
                    accepted_bulk_reads.append((now, cost))

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
            assert max(bulk_sizes) <= 10
            assert len(bulk_sizes) >= failures + 5
            assert individual_task_reads == []
            if capacity:
                assert capacity_denials == [], capacity_denials
                assert sum(cost for _, cost in accepted_bulk_reads) >= 45
                assert len(accepted_bulk_reads) >= 3
            assert not page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        finally:
            if capacity:
                print(f"capacity fixture: competing={competing_reads}/sec, "
                      f"denials={capacity_denials}, "
                      f"accepted_bulk_batches={len(accepted_bulk_reads)}")
            context.close()
            browser.close()
