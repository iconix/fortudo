from fnmatch import fnmatchcase
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from textwrap import dedent

import pytest


WORKFLOW = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "ci-cd.yml"


def test_preview_deploy_exports_url_and_updates_one_pr_comment():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "pull-requests: write" in workflow
    assert "id: deploy-preview" in workflow
    assert "if: steps.deploy-preview.outputs.preview_url != ''" in workflow
    assert "PREVIEW_URL: ${{ steps.deploy-preview.outputs.preview_url }}" in workflow
    assert "PREVIEW_EXPIRES: ${{ steps.deploy-preview.outputs.preview_expires }}" in workflow
    assert "Visit the preview URL for this PR (updated for commit" in workflow
    assert "toUTCString()" in workflow
    assert "Firebase Hosting GitHub Action" not in workflow
    assert "createHash('sha1')" not in workflow
    assert ".update('fortudo')" not in workflow
    assert "Sign: ${signature}" not in workflow
    assert "<!-- firebase-hosting-preview -->" in workflow
    assert "await github.paginate(" in workflow
    assert "github.rest.issues.listComments" in workflow
    assert "github.rest.issues.updateComment" in workflow
    assert "github.rest.issues.createComment" in workflow


@pytest.mark.parametrize("scenario", ["deployed", "already-active", "list-failed", "missing"])
def test_preview_job_reports_only_its_own_channel(tmp_path, scenario):
    workflow = WORKFLOW.read_text(encoding="utf-8")
    step = workflow.split("- name: Deploy to Firebase Hosting (Preview)", 1)[1]
    commands = dedent(step.split("run: |\n", 1)[1].split("\n              env:", 1)[0])
    commands = commands.replace("${{ github.event.pull_request.number }}", "95")
    channels = [
        {"name": "sites/fortudo/channels/pr1-first", "url": "https://a.web.app",
         "expireTime": "2099-01-01T00:00:00Z"},
    ]
    if scenario != "missing":
        channels.append({
            "name": "projects/123456789/sites/fortudo/channels/pr95-feature",
            "url": "https://z.web.app", "expireTime": "2099-02-01T00:00:00Z",
        })
    (tmp_path / "channels").write_text(json.dumps({"result": {"channels": channels}}))
    output = tmp_path / "output"
    bash = "bash"
    if os.name == "nt":
        exec_path = subprocess.check_output(["git", "--exec-path"], text=True).strip()
        bash = next(
            parent / "bin" / "bash.exe" for parent in Path(exec_path).resolve().parents
            if (parent / "bin" / "bash.exe").is_file()
        )
    stub = """
python3() { "$TEST_PYTHON" "$@"; }
npx() {
  case "$2" in
    hosting:channel:list)
      if [ -e "$RUNNER_TEMP/listed" ] && [ "$SCENARIO" = list-failed ]; then return 23; fi
      touch "$RUNNER_TEMP/listed"
      cat "$RUNNER_TEMP/channels";;
    hosting:channel:deploy)
      if [ "$SCENARIO" = deployed ]; then return 0; fi
      echo 'is the current active version'; return 7;;
    *) return 86;;
  esac
}
"""
    result = subprocess.run(
        [bash, "--noprofile", "--norc", "-s"], input=stub + commands,
        cwd=WORKFLOW.parents[2], text=True, capture_output=True,
        env={**os.environ, "TEST_PYTHON": Path(sys.executable).as_posix(),
             "RUNNER_TEMP": tmp_path.as_posix(), "GITHUB_OUTPUT": output.as_posix(),
             "GITHUB_HEAD_REF": "feature", "SCENARIO": scenario},
    )
    lines = output.read_text().splitlines() if output.exists() else []
    if scenario in ("missing", "list-failed"):
        assert result.returncode != 0
        assert lines == []
    else:
        assert result.returncode == 0, result.stderr
        assert lines == ["preview_url=https://z.web.app", "preview_expires=2099-02-01T00:00:00Z"]
        assert all(line in result.stdout for line in lines)


def test_preview_deploy_reuses_one_channel_and_prunes_only_parser_selected_channels():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert 'scripts/firebase_preview_channels.py --name "${{ github.event.pull_request.number }}" "$branch"' in workflow
    assert 'short_sha="$(printf' not in workflow
    assert '${channel}-${short_sha}' not in workflow
    assert 'legacy_channel_prefix="${channel}-"' in workflow
    assert 'cleanup_cutoff="$(date -u +' in workflow
    assert "python3 scripts/firebase_preview_channels.py" in workflow
    assert '"$channel" \\' in workflow
    assert '"$cleanup_cutoff" > "$cleanup_channels_file"' in workflow
    assert 'hosting:channel:list' in workflow
    assert 'done < "$cleanup_channels_file"' in workflow
    assert 'hosting:channel:delete "$cleanup_channel"' in workflow
    assert '--site fortudo' in workflow
    assert 'hosting:channel:delete "$channel"' in workflow


def test_firebase_deploys_only_changed_public_output_with_seven_day_previews():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "has_deploy_changes: ${{ steps.deploy_filter.outputs.deploy }}" in workflow
    deploy_step = workflow.split("- name: Detect deployable hosting changes", 1)[1].split(
        "\n    test:", 1
    )[0]
    assert "predicate-quantifier" not in deploy_step
    deploy_patterns = re.findall(r"^\s+- '([^']+)'$", deploy_step, flags=re.MULTILINE)
    assert deploy_patterns == ["public/**", "firebase.json"]

    def matches_deploy_output(path):
        return any(fnmatchcase(path, pattern) for pattern in deploy_patterns)

    assert matches_deploy_output("public/js/app.js")
    assert matches_deploy_output("firebase.json")
    assert not matches_deploy_output("scripts/document_contract_ops.py")
    assert not matches_deploy_output("tests/test_document_contract_ops.py")
    assert workflow.count("needs.check_for_code_changes.outputs.has_deploy_changes") == 2
    assert "needs.check_for_code_changes.outputs.has_code_changes == 'true'" not in workflow
    assert workflow.count("--expires 7d") == 2
    assert "--expires 30d" not in workflow
