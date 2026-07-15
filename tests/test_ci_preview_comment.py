from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "ci-cd.yml"


def test_preview_deploy_exports_url_and_updates_one_pr_comment():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "pull-requests: write" in workflow
    assert "id: deploy-preview" in workflow
    assert 'echo "preview_url=$preview_url" >> "$GITHUB_OUTPUT"' in workflow
    assert 'echo "preview_expires=$preview_expires" >> "$GITHUB_OUTPUT"' in workflow
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
