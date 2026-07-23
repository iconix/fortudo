"""Repository boundaries for reusable Cloudant migration safety code."""

from __future__ import annotations

import inspect

from scripts.cloudant_migration import client, state
from scripts.migrations.taxonomy_identity_v1 import dat_411_operation


def test_reusable_cloudant_modules_exclude_product_and_operation_constants() -> None:
    reusable_source = "\n".join(
        [
            inspect.getsource(client),
            inspect.getsource(state),
        ]
    )

    assert "fortudo-dat-411" not in reusable_source
    assert "work/meetings" not in reusable_source
    assert "work/comms" not in reusable_source
    assert "config-taxonomy-identity-migration-v1" not in reusable_source


def test_dat_411_operation_retains_exact_production_lock() -> None:
    assert dat_411_operation.SOURCE_DATABASE == "fortudo-dat-411"
    assert (
        dat_411_operation.COMPLETION_MARKER_ID
        == "config-taxonomy-identity-migration-v1"
    )


def test_operation_reuses_canonical_state_types() -> None:
    assert dat_411_operation.StateModel is state.StateModel
    assert dat_411_operation.OperationalCloudantClient.__mro__[1] is client.CloudantMigrationClient
