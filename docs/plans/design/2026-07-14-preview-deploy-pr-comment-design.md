# Preview Deployment PR Comment Design

## Goal

Restore the Firebase Hosting preview URL comment on pull requests without giving up the
retry and stale-channel handling provided by the current Firebase CLI deployment step.

## Root cause

The original workflow used `FirebaseExtended/action-hosting-deploy`, which posted and
updated a pull-request comment automatically. Commit `cd0390c` replaced that action with
direct `firebase-tools` commands to make preview deployments reliable when channels
already existed. The replacement preserved URL logging but did not replace the action's
commenting behavior.

## Considered approaches

1. Return to `FirebaseExtended/action-hosting-deploy`. This restores comments but also
   removes the explicit retry and stale-channel recovery that motivated the CLI switch.
2. Add a dedicated third-party PR-comment action. This is concise but introduces another
   dependency for behavior GitHub's maintained script action can provide directly.
3. Keep the Firebase CLI deployment and add `actions/github-script`. This preserves the
   reliable deploy path, uses an action already present in the repository, and allows the
   comment to be updated idempotently. This is the selected approach.

## Design

The preview deployment step will receive an `id` and expose the first discovered
`web.app` or `firebaseapp.com` URL through `$GITHUB_OUTPUT`. Every successful path uses
the existing URL-discovery helper, so normal deploys, recreated channels, and already
active channels produce the same output.

A following `actions/github-script@v9` step will run only when the deploy output contains
a URL. It will use a stable HTML marker to find a previous bot-authored preview comment on
the pull request. If found, it updates that comment; otherwise, it creates one. The body
will retain the useful parts of the former Firebase Hosting action's presentation: “Visit
the preview URL for this PR,” the short deployed commit SHA, the full linked preview URL,
and the actual Firebase expiration time. It will not attribute the deployment to the
retired action or display that action's legacy site signature. The hidden marker remains
the authoritative identifier for updates. Updating one comment avoids notification noise
and prevents stale URLs after subsequent pushes.

The deploy helper will export both the URL and Firebase's `expireTime` value from the CLI
JSON. The comment step will format the timestamp with JavaScript's `toUTCString()`, matching
the former action. If the successful CLI response unexpectedly lacks an expiration time,
the comment will omit the expiry line rather than inventing one.

The deploy job will declare the minimum required permissions: read access to repository
contents and write access to pull requests. Preview deployment remains disabled for
Dependabot, matching current behavior.

## Failure behavior

Deployment remains the source of truth. A deployment failure stops the job before the
comment step. If deployment succeeds but no URL can be extracted, the existing diagnostic
message remains in the job log and the comment step is skipped rather than posting a
broken link. If the expiration time is absent or invalid, the remaining legacy-style
content is still posted and the expiry line is omitted.

## Verification

A static workflow regression test will assert that:

- the deploy step exports a preview URL;
- the deploy step exports the Firebase expiration time;
- the comment step consumes that output;
- the comment body retains the useful commit, URL, and expiry information without stale
  action attribution or signature content;
- the stable marker and update-or-create behavior remain present; and
- the job has pull-request write permission.

The test will be observed failing before the workflow change and passing afterward. The
normal JavaScript, formatting, and Python suites will run before publication.

Workflow-only and Markdown-only changes are deliberately excluded from preview deployment
by the existing path filter. This implementation also adds a Python regression test,
which makes its PR eligible for preview deployment. Its first successful deploy must
create the preview comment, and the follow-up documentation push must update the same
comment rather than duplicate it.
