from scripts.migrations.taxonomy_identity_v1 import dat_411_operation as migration
from tests.migrations.taxonomy_identity_v1.test_dat_411_operation import (
    migration_winners,
    state_for_winner_documents,
)


def test_preflight_can_only_publish_a_snapshot_that_existed():
    stopped = migration_winners()
    timer = {"_id": "config-running-activity", "_rev": "1-started"}
    running = [*stopped, timer]
    snapshots = [(docs, state_for_winner_documents(docs)) for docs in (stopped, running)]
    allowed = {(graph.fingerprint, bool(index)) for index, (_, graph) in enumerate(snapshots)}

    class Source:
        account_checksum = "a" * 64

        def __init__(self, start_after_reads):
            self.start_after_reads = start_after_reads
            self.reads = []

        def read(self, name):
            running_now = len(self.reads) >= self.start_after_reads
            self.reads.append(name)
            return snapshots[running_now]

        def get_state_model(self, _database):
            return self.read("revision graph")[1]

        def get_security_hash(self, _database):
            self.read("security")
            return "b" * 64

        def get_document(self, _database, document_id):
            docs, _ = self.read(document_id)
            return next((doc for doc in docs if doc["_id"] == document_id), None)

        def get_all_documents(self, _database, *, include_conflicts):
            return self.read("winning documents")[0]

    def preflight(client):
        report = migration.execute_cli(
            ["preflight"], environ={migration.CREDENTIAL_ENV_VAR: "fixture"},
            client_factory=lambda _url: client,
        )
        return report["sourceFingerprint"], report["runningTimerPresent"]

    stopped_client = Source(float("inf"))
    assert preflight(stopped_client) == (snapshots[0][1].fingerprint, False)
    running_client = Source(0)
    assert preflight(running_client) == (snapshots[1][1].fingerprint, True)
    for boundary in range(1, len(stopped_client.reads)):
        source = Source(boundary)
        try:
            result = preflight(source)
        except migration.QuarantineSafetyError:
            continue
        assert result in allowed, f"timer started after {source.reads[:boundary]}"
