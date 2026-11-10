"""Reproduce dat-411 checkpoint-only bursts using disposable local/HTTP replicas."""

import json
import time
from collections import deque
from urllib.parse import parse_qs, unquote, urlsplit

import pytest
from playwright.sync_api import sync_playwright

from tests.e2e.helpers import BASE_URL, launch_e2e_page


@pytest.mark.parametrize("failure", ["none", "429", "lost-ack", "unapplied", "exhausted", "exhausted-source"])
def test_already_present_revisions_checkpoint_safely(app_server, failure):
    origin = "https://checkpoint-fixture.cloudantnosqldb.appdomain.cloud"
    documents = [
        {"_id": f"task-{index}", "_rev": "1-" + f"{index:032x}", "value": index}
        for index in range(125)
    ]
    checkpoints = {}
    accepted_times = deque()
    put_times = []
    capacity_denials = []
    unexpected_writes = []
    injected = 0
    revision = 0

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, context_options={"service_workers": "block"}
        )

        def cloud(route):
            nonlocal injected, revision
            request = route.request
            path = unquote(urlsplit(request.url).path).strip("/")
            operation = path.split("/", 1)[1] if "/" in path else ""
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
            elif not path:
                reply({"uuid": "checkpoint-fixture-account"})
            elif not operation:
                reply({"db_name": "db", "doc_count": len(documents), "update_seq": 125})
            elif operation == "_revs_diff":
                # All application revisions already exist, as in the captured burst.
                assert all(doc_id in {doc["_id"] for doc in documents} for doc_id in body)
                reply({})
            elif operation == "_changes":
                query = parse_qs(urlsplit(request.url).query)
                since = int(query.get("since", ["0"])[0])
                limit = int(query.get("limit", ["100"])[0])
                batch = documents[since:since + limit]
                last = since + len(batch)
                reply({"results": [{"id": doc["_id"], "seq": since + index,
                       "changes": [{"rev": doc["_rev"]}]} for index, doc in enumerate(batch, 1)],
                       "last_seq": last, "pending": len(documents) - last})
            elif operation.startswith("_local/") and request.method == "GET":
                if operation in checkpoints:
                    reply(checkpoints[operation])
                else:
                    reply({"error": "not_found"}, 404)
            elif operation.startswith("_local/") and request.method == "PUT":
                now = time.monotonic()
                put_times.append(now)
                while accepted_times and accepted_times[0] <= now - 1:
                    accepted_times.popleft()
                if len(accepted_times) >= 10:
                    capacity_denials.append(now)
                    reply({"error": "too_many_requests"}, 429)
                    return
                if failure.startswith("exhausted") or (failure == "429" and injected == 0):
                    injected += 1
                    reply({"error": "too_many_requests"}, 429)
                    return
                if failure == "unapplied" and injected == 0:
                    injected += 1
                    route.abort("failed")
                    return
                current = checkpoints.get(operation)
                if current and body.get("_rev") != current["_rev"]:
                    reply({"error": "conflict"}, 409)
                    return
                revision += 1
                checkpoints[operation] = {**body, "_rev": f"0-{revision}"}
                accepted_times.append(now)
                if failure == "lost-ack" and injected == 0:
                    injected += 1
                    route.abort("failed")
                    return
                reply({"ok": True, "id": operation, "rev": checkpoints[operation]["_rev"]}, 201)
            else:
                unexpected_writes.append((request.method, operation))
                reply({"error": "unexpected_request"}, 500)

        context.route(f"{origin}/**", cloud)
        try:
            page.goto(BASE_URL)
            result = page.evaluate("""async ({origin, documents, failure}) => {
                const {createSyncFetch, SYNC_REPLICATION_OPTIONS} = await import('/js/sync-transport.js');
                const local = new window.PouchDB('checkpoint-regression-local');
                const remote = new window.PouchDB(origin + '/db', {
                    skip_setup: true,
                    fetch: createSyncFetch((...args) => window.PouchDB.fetch(...args))
                });
                try {
                    await local.bulkDocs(documents, {new_edits: false});
                    let first;
                    try { first = failure === 'exhausted-source'
                        ? await remote.replicate.to(local, {...SYNC_REPLICATION_OPTIONS})
                        : await local.replicate.to(remote, {...SYNC_REPLICATION_OPTIONS}); }
                    catch (error) { first = {ok: false, status: error.status}; }
                    // Never turn an unapplied/unknown checkpoint outcome into success.
                    if (failure.startsWith('exhausted')) return {first};
                    const retried = await local.replicate.to(remote, {...SYNC_REPLICATION_OPTIONS});
                    const resumed = await local.replicate.to(remote, {...SYNC_REPLICATION_OPTIONS});
                    const rows = (await local.allDocs({include_docs: true})).rows;
                    const localChanges = await local.changes({since: 0});
                    return {first, retried, resumed, unchanged: rows.every(row => {
                        const expected = documents.find(doc => doc._id === row.id);
                        return Object.keys(row.doc).length === Object.keys(expected).length &&
                            Object.keys(expected).every(key => row.doc[key] === expected[key]);
                    }),
                        localChangeCount: localChanges.results.length};
                } finally { await local.close(); await remote.close(); }
            }""", {"origin": origin, "documents": documents, "failure": failure})
            assert capacity_denials == []
            assert unexpected_writes == []
            if failure.startswith("exhausted"):
                assert result["first"]["ok"] is False
                assert injected == 4
            else:
                assert result["first"]["ok"] is (failure != "unapplied")
                assert result["retried"]["ok"] is True
                assert result["resumed"]["ok"] is True
                assert result["resumed"]["docs_written"] == 0
                assert result["unchanged"] is True
                assert result["localChangeCount"] == len(documents)
                assert len(checkpoints) == 1
                assert next(iter(checkpoints.values()))["last_seq"] == 125
                assert revision == 13  # lost acknowledgement must not duplicate a write
            # Completion-time spacing is intentionally conservative; allow timer resolution.
            assert all(later - earlier >= 0.18 for earlier, later in zip(put_times, put_times[1:]))
        finally:
            context.close()
            browser.close()
