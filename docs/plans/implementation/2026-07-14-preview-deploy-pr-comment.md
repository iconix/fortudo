# Preview Deployment PR Comment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore one automatically updated Firebase preview URL comment on eligible pull requests.

**Architecture:** Keep the hardened Firebase CLI deployment intact. Export the discovered preview URL as a deploy-step output, then use `actions/github-script@v9` to create or update a marker-tagged pull-request comment.

**Tech Stack:** GitHub Actions YAML, Bash, `actions/github-script@v9`, Python/pytest static workflow regression test

## Global Constraints

- Preserve the existing Firebase CLI retry and stale-channel recovery behavior.
- Use one marker-tagged bot comment and update it on later pushes; do not create duplicates.
- Skip commenting when deployment does not produce a preview URL.
- Grant only `contents: read` and `pull-requests: write` to the preview job.
- Keep Dependabot preview deployment disabled.
- Workflow-only pull requests remain excluded from preview deployment by the existing path filter.
- Retain the useful commit SHA, full preview URL, and expiry; do not attribute deployment to the retired action or display its legacy signature.
- Omit the expiry line when Firebase does not return a valid `expireTime`; never synthesize one.

---

### Task 1: Export and comment the preview URL

**Files:**

- Create: `tests/test_ci_preview_comment.py`
- Modify: `.github/workflows/ci-cd.yml:161-263`

**Interfaces:**

- Consumes: the preview URL printed by `firebase-tools hosting:channel:deploy` or `hosting:channel:list`
- Produces: `steps.deploy-preview.outputs.preview_url`, and one PR comment containing `<!-- firebase-hosting-preview -->`

- [x] **Step 1: Write the failing workflow regression test**

Create `tests/test_ci_preview_comment.py`:

```python
from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "ci-cd.yml"


def test_preview_deploy_exports_url_and_updates_one_pr_comment():
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert "pull-requests: write" in workflow
    assert "id: deploy-preview" in workflow
    assert 'echo "preview_url=$preview_url" >> "$GITHUB_OUTPUT"' in workflow
    assert "if: steps.deploy-preview.outputs.preview_url != ''" in workflow
    assert "PREVIEW_URL: ${{ steps.deploy-preview.outputs.preview_url }}" in workflow
    assert "<!-- firebase-hosting-preview -->" in workflow
    assert "await github.paginate(" in workflow
    assert "github.rest.issues.listComments" in workflow
    assert "github.rest.issues.updateComment" in workflow
    assert "github.rest.issues.createComment" in workflow
```

- [x] **Step 2: Run the regression test to verify RED**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 failed`; the first missing assertion is `pull-requests: write`.

- [x] **Step 3: Export the preview URL from every successful deploy path**

In `.github/workflows/ci-cd.yml`, add least-privilege permissions to `deploy-preview`:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Give the deploy step an ID:

```yaml
- name: Deploy to Firebase Hosting (Preview)
  id: deploy-preview
```

Replace `print_preview_urls` with the following helper and update all three callers to use `export_preview_url`:

```bash
export_preview_url() {
  local source_file="$1"
  local preview_url
  preview_url="$(
    grep -Eo 'https://[^"[:space:]]+' "$source_file" |
    grep -E 'web\.app|firebaseapp\.com' |
    sort -u |
    head -n 1
  )"

  if [ -n "$preview_url" ]; then
    echo "Firebase Hosting preview URL: $preview_url"
    echo "preview_url=$preview_url" >> "$GITHUB_OUTPUT"
  else
    echo "Firebase Hosting preview URL was not present in $source_file."
  fi
}
```

- [x] **Step 4: Add the idempotent PR comment step**

After the preview deployment step, add:

```yaml
- name: Comment preview URL on pull request
  if: steps.deploy-preview.outputs.preview_url != ''
  uses: actions/github-script@v9
  env:
    PREVIEW_URL: ${{ steps.deploy-preview.outputs.preview_url }}
    DEPLOYED_SHA: ${{ github.event.pull_request.head.sha }}
  with:
    script: |
      const marker = '<!-- firebase-hosting-preview -->';
      const body = [
        marker,
        '## Firebase Hosting preview',
        '',
        `[Open preview](${process.env.PREVIEW_URL})`,
        '',
        `Preview for commit \`${process.env.DEPLOYED_SHA.slice(0, 7)}\`.`,
      ].join('\n');

      const issue = {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
      };
      const comments = await github.paginate(
        github.rest.issues.listComments,
        issue,
      );
      const existing = comments.find(
        (comment) =>
          comment.user?.type === 'Bot' && comment.body?.includes(marker),
      );

      if (existing) {
        await github.rest.issues.updateComment({
          owner: issue.owner,
          repo: issue.repo,
          comment_id: existing.id,
          body,
        });
      } else {
        await github.rest.issues.createComment({ ...issue, body });
      }
```

- [x] **Step 5: Run the focused test to verify GREEN**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 passed`.

- [x] **Step 6: Run formatting and full verification**

Run:

```bash
npm run format
npm test -- --coverage --runInBand
npm run check
uv run --with pytest --with playwright python -m pytest tests -q
```

Expected:

- Jest: 61 suites and 1,290 tests pass with coverage thresholds satisfied.
- ESLint and Prettier pass.
- Pytest: 111 tests pass.

- [x] **Step 7: Commit the implementation**

```bash
git add .github/workflows/ci-cd.yml tests/test_ci_preview_comment.py docs/plans/implementation/2026-07-14-preview-deploy-pr-comment.md
git commit -m "ci: restore preview URL PR comment"
```

Expected: the pre-commit hook passes without `--no-verify`.

- [x] **Step 8: Publish the separate PR**

```bash
git push -u origin codex/restore-preview-comment
gh pr create --draft --base main --head codex/restore-preview-comment --fill
```

Expected: GitHub creates a draft PR targeting `main`. The new Python regression test makes this PR eligible for preview deployment, so its first workflow run creates the marker-tagged comment. A follow-up documentation push updates the same comment instead of creating a duplicate.

---

### Task 2: Match the legacy Firebase comment content

**Files:**

- Modify: `tests/test_ci_preview_comment.py`
- Modify: `.github/workflows/ci-cd.yml:187-299`

**Interfaces:**

- Consumes: Firebase CLI JSON fields `result.<site>.url` and `result.<site>.expireTime`
- Produces: `steps.deploy-preview.outputs.preview_url`, `steps.deploy-preview.outputs.preview_expires`, and the existing marker-tagged PR comment in the former Firebase action's format

- [x] **Step 1: Extend the workflow regression test**

Add these assertions to `test_preview_deploy_exports_url_and_updates_one_pr_comment` after the existing preview URL assertions:

```python
assert 'echo "preview_expires=$preview_expires" >> "$GITHUB_OUTPUT"' in workflow
assert "PREVIEW_EXPIRES: ${{ steps.deploy-preview.outputs.preview_expires }}" in workflow
assert "Visit the preview URL for this PR (updated for commit" in workflow
assert "toUTCString()" in workflow
assert "Firebase Hosting GitHub Action" in workflow
assert "createHash('sha1')" in workflow
assert ".update('fortudo')" in workflow
```

- [x] **Step 2: Run the focused test to verify RED**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 failed` because `preview_expires` is not exported yet.

- [x] **Step 3: Export the actual Firebase expiration time**

Rename `export_preview_url` to `export_preview_details`. After the existing `preview_url` extraction, add:

```bash
local preview_expires
preview_expires="$(
  grep -Eo '"expireTime":[[:space:]]*"[^"]+"' "$source_file" |
  head -n 1 |
  sed -E 's/^"expireTime":[[:space:]]*"([^"]+)"$/\1/'
)"
```

Inside the successful URL branch, export the timestamp only when Firebase supplied it:

```bash
if [ -n "$preview_expires" ]; then
  echo "Firebase Hosting preview expiry: $preview_expires"
  echo "preview_expires=$preview_expires" >> "$GITHUB_OUTPUT"
fi
```

Update all three callers from `export_preview_url` to `export_preview_details`.

- [x] **Step 4: Render the former Firebase action's comment format**

Add the expiry output to the comment step environment:

```yaml
PREVIEW_EXPIRES: ${{ steps.deploy-preview.outputs.preview_expires }}
```

Replace the comment body's construction with:

```javascript
const marker = '<!-- firebase-hosting-preview -->';
const shortSha = process.env.DEPLOYED_SHA.slice(0, 7);
const expires = new Date(process.env.PREVIEW_EXPIRES);
const expiryLines = Number.isNaN(expires.getTime())
  ? []
  : [`(expires ${expires.toUTCString()})`, ''];
const signature = require('node:crypto')
  .createHash('sha1')
  .update('fortudo')
  .digest('hex');
const body = [
  marker,
  `Visit the preview URL for this PR (updated for commit ${shortSha}):`,
  '',
  `[${process.env.PREVIEW_URL}](${process.env.PREVIEW_URL})`,
  '',
  ...expiryLines,
  '🔥 via [Firebase Hosting GitHub Action](https://github.com/marketplace/actions/deploy-to-firebase-hosting) 🌎',
  '',
  `Sign: ${signature}`
].join('\n');
```

Keep the existing marker lookup and update-or-create logic unchanged.

- [x] **Step 5: Run the focused test to verify GREEN**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 passed`.

- [x] **Step 6: Run formatting and full verification**

Run:

```bash
npm run format
npm test -- --coverage --runInBand
npm run check
uv run --with pytest --with playwright python -m pytest tests -q
git diff --check
```

Expected:

- Jest: 61 suites and 1,290 tests pass with coverage thresholds satisfied.
- ESLint and Prettier pass.
- Pytest: 111 tests pass.
- `git diff --check` reports no errors.

- [x] **Step 7: Commit and publish the follow-up**

```bash
git add .github/workflows/ci-cd.yml tests/test_ci_preview_comment.py docs/plans/implementation/2026-07-14-preview-deploy-pr-comment.md
git commit -m "ci: match legacy preview comment content"
git push
```

Expected: the pre-commit hook passes without `--no-verify`; PR #95 updates and its preview comment retains the same comment ID while adopting the legacy content.

---

### Task 3: Remove stale action metadata

**Files:**

- Modify: `tests/test_ci_preview_comment.py`
- Modify: `.github/workflows/ci-cd.yml:284-305`

**Interfaces:**

- Consumes: `PREVIEW_URL`, `PREVIEW_EXPIRES`, and `DEPLOYED_SHA`
- Produces: the existing marker-tagged PR comment containing only the deployed commit SHA, full preview URL, and valid Firebase expiry

- [ ] **Step 1: Change the regression test to reject stale metadata**

Replace the three positive assertions for action attribution and signature generation with:

```python
assert "Firebase Hosting GitHub Action" not in workflow
assert "createHash('sha1')" not in workflow
assert ".update('fortudo')" not in workflow
assert "Sign: ${signature}" not in workflow
```

Keep the positive assertions for the commit wording, preview URL output, and `toUTCString()` expiry formatting.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 failed` because the workflow still contains `Firebase Hosting GitHub Action`.

- [ ] **Step 3: Remove the retired action metadata**

Delete the signature construction:

```javascript
const signature = require('node:crypto')
  .createHash('sha1')
  .update('fortudo')
  .digest('hex');
```

Replace the body construction with:

```javascript
const body = [
  marker,
  `Visit the preview URL for this PR (updated for commit ${shortSha}):`,
  '',
  `[${process.env.PREVIEW_URL}](${process.env.PREVIEW_URL})`,
  '',
  ...expiryLines
].join('\n');
```

Keep the hidden marker, actual expiry parsing, and existing update-or-create logic unchanged.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
uv run --with pytest python -m pytest tests/test_ci_preview_comment.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Run formatting and full verification**

Run:

```bash
npm run format
npm test -- --coverage --runInBand
npm run check
uv run --with pytest --with playwright python -m pytest tests -q
git diff --check
```

Expected:

- Jest: 61 suites and 1,290 tests pass with coverage thresholds satisfied.
- ESLint and Prettier pass.
- Pytest: 111 tests pass.
- `git diff --check` reports no errors.

- [ ] **Step 6: Commit and publish the cleanup**

```bash
git add .github/workflows/ci-cd.yml tests/test_ci_preview_comment.py docs/plans/implementation/2026-07-14-preview-deploy-pr-comment.md
git commit -m "ci: remove stale preview comment metadata"
git push
```

Expected: the pre-commit hook passes without `--no-verify`; PR #95 updates and the same marker comment no longer attributes deployment to the retired action or displays its signature.
