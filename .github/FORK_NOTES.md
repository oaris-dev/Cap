# Fork Notes (oaris-dev/cap)

This is a fork of [CapSoftware/Cap](https://github.com/CapSoftware/Cap) maintained for our freelance agency. The fork is published under AGPL-3.0 at [github.com/oaris-dev/Cap](https://github.com/oaris-dev/Cap), preserves the upstream LICENSE, and uses `oaris:` commit prefixes for permanent fork patches so changes are easy to audit.

This doc is the public, self-contained playbook for syncing from upstream `CapSoftware/Cap` into this fork's deployment branches. Operator-only material (production URLs, credentials, S3 bucket names, container-platform specifics) lives in a private ops repo and is intentionally **not** in this file.

---

## Branch Model

| Branch | Role |
|---|---|
| `main` | Pure upstream mirror — only fast-forward merges from `upstream/main`. Never commit here directly. |
| `oaris/staging` | Staging environment. Sync lands here first for validation. Docker image built manually (`workflow_dispatch`). |
| `oaris/deploy` | Production. Auto-builds `:latest` Docker image on push. |
| `feature/*` | Branched from `oaris/deploy`; PR'd to `oaris/staging` for review/test, then merged to `oaris/deploy`. |
| `proposal/<name>` | Branched from `upstream/main` (NOT from `oaris/*`). Used to validate upstream-PR candidates against a clean upstream baseline. Auto-builds `:proposal-<name>` image. |

Remotes (assumed):

| Remote | URL |
|---|---|
| `origin` | `github.com/oaris-dev/Cap` |
| `upstream` | `github.com/CapSoftware/Cap` (fetch-only) |

---

## Upstream Sync Ritual

The sync is invasive enough that the procedure must not live in tribal memory. Follow these phases in order. **Never push directly to `oaris/deploy`** — every sync lands on `oaris/staging` first, gets validated, then gets fast-forwarded (or merged) to `oaris/deploy`.

### Phase 1 — Pre-sync capture

Run these before touching any branch so you have a baseline to compare against and a backup to fall back to.

```bash
git fetch upstream --no-tags
git fetch origin --no-tags

UPSTREAM_HEAD=$(git rev-parse upstream/main)
DEPLOY_HEAD=$(git rev-parse origin/oaris/deploy)
STAGING_HEAD=$(git rev-parse origin/oaris/staging)
MAIN_HEAD=$(git rev-parse origin/main)

echo "upstream/main: $UPSTREAM_HEAD"
echo "origin/main:   $MAIN_HEAD"
echo "oaris/staging: $STAGING_HEAD"
echo "oaris/deploy:  $DEPLOY_HEAD"

git log --oneline origin/main..origin/oaris/deploy | wc -l
git log --oneline origin/main..origin/oaris/deploy

git push origin refs/remotes/origin/oaris/deploy:refs/heads/oaris/deploy-backup-pre-sync
git push origin refs/remotes/origin/oaris/staging:refs/heads/oaris/staging-backup-pre-sync
```

Also write down:
- The latest upstream tag/version you're syncing to (find with `git -c versionsort.suffix=- tag --sort=-v:refname --merged upstream/main | head -5`).
- Any in-flight upstream PRs we have submitted — anything merged upstream since the last sync means the corresponding local patch can be dropped. See the "Upstream PR tracking" section below and the private ops doc for the current list.
- The currently-deployed image tag in your container registry, so you can roll back if needed.

### Phase 2 — Update `main` (pure upstream mirror)

```bash
git checkout main
git merge upstream/main --ff-only
git push origin main
```

If the fast-forward fails, something committed to `main` directly — stop and investigate before continuing. `main` must remain a strict mirror of upstream.

### Phase 3 — Rebase `oaris/staging` on `main` first

Sync always lands on `oaris/staging` first. **Never rebase `oaris/deploy` directly against `main`.**

```bash
git checkout oaris/staging
git pull --ff-only
git rebase main
```

Expect conflicts. Resolve them with the "Common conflict files" guide below. After each conflict resolution:

```bash
git add <resolved files>
git rebase --continue
```

When the rebase completes, run the **Feature-preservation checklist** (below) before pushing anything.

### Phase 4 — Regenerate lockfile if upstream touched any `package.json`

```bash
git diff --name-only main@{1} main | grep -E 'package\.json$' || echo "no package.json changes"

pnpm install --filter @cap/web...
git diff --quiet pnpm-lock.yaml || git add pnpm-lock.yaml
git diff --cached --quiet || git commit -m "oaris: regenerate pnpm-lock.yaml after upstream sync"
```

Skipping this step causes Docker builds to fail with `ERR_PNPM_OUTDATED_LOCKFILE`.

### Phase 5 — Push staging and validate

```bash
git push origin oaris/staging --force-with-lease
```

Trigger the staging Docker build (this is manual on purpose):

```bash
gh workflow run "Docker Build Web" --repo oaris-dev/Cap --ref oaris/staging -f tag=staging
```

Point your staging environment at the new `:staging` image (or force-pull) and run the **Post-sync smoke tests** below.

### Phase 6 — Production cutover

Only after staging is green:

```bash
git checkout oaris/deploy
git pull --ff-only
git merge --ff-only oaris/staging
git push origin oaris/deploy
```

If fast-forward isn't possible (because `oaris/deploy` has commits `oaris/staging` doesn't), stop and reconcile — typically by rebasing or cherry-picking those deploy-only commits onto `oaris/staging` first, then retrying. Pushing to `oaris/deploy` auto-triggers the production Docker build via `docker-build-web.yml`.

### Phase 7 — Cancel stray workflow runs

The push to `main` in Phase 2 may trigger workflow runs against the now-trimmed CI surface or against workflows that no longer apply. Go to [Actions](https://github.com/oaris-dev/Cap/actions), find any in-progress runs spawned by sync commits, and cancel them manually to avoid wasted CI minutes and noisy failure notifications.

---

## Common Conflict Files

Conflicts almost always cluster in the same files. For each, the resolution rule is "keep ours unless upstream has a strict improvement we want."

| File | Why it conflicts | Resolution |
|---|---|---|
| `apps/web/proxy.ts` | Upstream evolves the middleware; we patch both the path allow-list and the matcher exclusion. | Keep our `/.well-known/` and `/embed/` allow-list entries. Verify with `grep -n "well-known\|embed" apps/web/proxy.ts`. Without `/.well-known/`, the workflow engine breaks silently (POSTs 307-redirect to `/login`). Currently being upstreamed as PR #1833. |
| `apps/web/lib/transcribe.ts` | We add Voxtral as primary STT and gate Deepgram behind an env check. Upstream sometimes refactors transcription. | Keep our Voxtral path. After resolving, run `grep -n "voxtral\|MISTRAL_API_KEY" apps/web/lib/transcribe.ts` — should return matches. There is also a transcription-race guard being upstreamed as PR #1832; if upstream has merged it, drop our local guard. |
| `apps/web/lib/generate-ai.ts` | We add Mistral as primary AI provider with Groq/OpenAI as fallback. | Keep the Mistral branch. Verify: `grep -n "MISTRAL_API_KEY\|api.mistral.ai" apps/web/lib/generate-ai.ts`. |
| `apps/web/Dockerfile` | Upstream may change the build stage; we add `WORKFLOW_*` runtime env vars and `PORT`. | Keep `WORKFLOW_TARGET_WORLD=local`, `WORKFLOW_LOCAL_BASE_URL=http://127.0.0.1:3000`, `WORKFLOW_LOCAL_DATA_DIR=.next/workflow-data`, `PORT=3000`. Without these, standalone-mode Docker builds can't run the workflow engine (`localhost` resolves to `::1` in Alpine but the server binds `0.0.0.0`, so `127.0.0.1` is required explicitly). |
| `apps/web/next.config.mjs` | Plugin chain changes upstream; we may have layered config tweaks. | Keep both: re-apply our patches on top of upstream's plugin order. |
| `pnpm-lock.yaml` | Always regenerated, never hand-resolved. | Take `theirs` (upstream), then run Phase 4 to regenerate. |
| `apps/web/app/layout.tsx` | We add League Spartan + Lexend font loaders and the `| oaris` metadata suffix. | Keep our font imports (`League_Spartan`, `Lexend`) and the metadata title suffix. |
| Email templates under `packages/database/emails/**` | Upstream tweaks templates; we rebrand sender + visuals. | Keep our "oaris" sender name and copy. Footer/legal-links treatment varies per template — see recent commit `5b3210e3b` for the current convention. |
| `.github/workflows/ci.yml` | Upstream adds desktop/Rust jobs we don't run. | Keep our trimmed web-only version (typecheck + Biome). Delete any reintroduced desktop/macOS/Windows/Clippy jobs. |
| `.github/workflows/performance-regressions.yml`, `publish.yml` | Upstream-only desktop perf + release workflows. | Resolve by deletion. They have no value in this fork. |
| `apps/desktop/src-tauri/tauri.conf.json` | Rarely touched (we only build web) but if synced, upstream resets `productName`/`identifier`. | Keep `productName: "Cap OARIS"`, `identifier: "de.oaris.cap.desktop"`, `mainBinaryName: "Cap OARIS"`, deep-link `cap-oaris://`. |

---

## Feature-Preservation Checklist

Run this checklist after the rebase and before pushing `oaris/staging`. Every item must either pass or be consciously dropped (e.g. because upstream merged the equivalent — see the "Upstream PR tracking" section).

### Branding and visual identity

- [ ] **OarisLogo component & assets** — files: `apps/web/components/OarisLogo.tsx`, `apps/web/public/oaris-logo.svg`, `apps/web/public/oaris-wordmark.svg`. Verify: `ls apps/web/components/OarisLogo.tsx apps/web/public/oaris-*.svg`. Visual: share page footer and embed page show the wordmark.
- [ ] **Custom favicons** — files: `apps/web/public/favicon.ico`, `apps/web/public/favicon-16x16.png`, `apps/web/public/favicon-32x32.png`. Verify: `ls apps/web/public/favicon*`. Visual: browser tab shows oaris favicon, not Cap's.
- [ ] **Page metadata `| oaris` suffix** — file: `apps/web/app/layout.tsx` (and any per-route `generateMetadata`). Verify: `grep -n "oaris" apps/web/app/layout.tsx`. Visual: browser title bar reads e.g. "Dashboard | oaris".
- [ ] **Brand fonts (League Spartan + Lexend)** — file: `apps/web/app/layout.tsx`. Verify: `grep -n "League_Spartan\|Lexend" apps/web/app/layout.tsx` returns the import and both `.variable` references on `<html>`/`<body>`.
- [ ] **Email rebrand** — files: `packages/database/emails/**`, sender name configuration. Verify: `grep -rn "oaris" packages/database/emails/ | head`. Smoke test: trigger a magic-link login on staging, confirm the email body and sender say "oaris".
- [ ] **Share page rebrand** — file: `apps/web/app/s/[videoId]/page.tsx` plus `_components/*`. Verify: `grep -n "oaris\|#3b7a6b" apps/web/app/s/[videoId]/page.tsx`. Visual: open a public share link in incognito; logo, brand color, footer with legal links visible.
- [ ] **Embed page rebrand** — file: `apps/web/app/embed/[videoId]/page.tsx`. Verify: `grep -n "oaris\|OarisLogo" apps/web/app/embed/[videoId]/page.tsx`. Visual: embed page renders with white background and bottom bar containing title + oaris logo.
- [ ] **Video player loading spinner with oaris logo** — files: `apps/web/app/s/[videoId]/_components/CapVideoPlayer.tsx`, `apps/web/app/s/[videoId]/_components/HLSVideoPlayer.tsx`. Verify: `grep -n "OarisLogo\|oaris-logo" apps/web/app/s/[videoId]/_components/*VideoPlayer.tsx`.

### Functional features (some upstreamable)

- [ ] **Voxtral STT (primary transcription)** — files: `apps/web/lib/transcribe-voxtral.ts`, patches to `apps/web/lib/transcribe.ts`. Verify: `ls apps/web/lib/transcribe-voxtral.ts && grep -n "transcribeWithVoxtral\|MISTRAL_API_KEY" apps/web/lib/transcribe.ts`. Smoke test: upload a short video on staging, confirm transcript appears.
- [ ] **Mistral AI metadata (GDPR-compliant)** — file: `apps/web/lib/generate-ai.ts`. Verify: `grep -n "MISTRAL_API_KEY\|api.mistral.ai\|mistral-small-latest" apps/web/lib/generate-ai.ts`. Smoke test: after upload, AI-generated title/summary appears on the share page (requires `MISTRAL_API_KEY` set in the env).
- [ ] **Deepgram EU endpoint support** — env var `DEEPGRAM_API_URL` in `packages/env/server.ts`; consumed in `apps/web/lib/transcribe.ts`. Verify: `grep -n "DEEPGRAM_API_URL" packages/env/server.ts apps/web/lib/transcribe.ts`.
- [ ] **`AI_RESPONSE_LANGUAGE` env var** — defined in `packages/env/server.ts`; consumed in `apps/web/lib/generate-ai.ts`. Verify: `grep -n "AI_RESPONSE_LANGUAGE" packages/env/server.ts apps/web/lib/`.
- [ ] **oEmbed endpoint** — file: `apps/web/app/api/oembed/route.ts`. Verify: `ls apps/web/app/api/oembed/route.ts && grep -n "application/json+oembed" apps/web/app/api/oembed/route.ts`. Smoke test: `curl 'https://<staging-host>/api/oembed?url=<share-url>'` returns an oEmbed JSON payload.
- [ ] **Sandbox-safe embeds (JWT + origin auth)** — files: `apps/web/lib/embed-token.ts` (server-only), `apps/web/lib/embed-token-shared.ts` (client-safe), patches in `apps/web/proxy.ts`. Verify: `ls apps/web/lib/embed-token*.ts && grep -n "verifyEmbedToken\|embed-token" apps/web/proxy.ts`. Smoke test: embed a password-protected video on a trusted origin (listed in `ALLOWED_EMBED_ORIGINS`) inside a sandboxed iframe; it should play without re-prompting for the password.
- [ ] **`ALLOWED_EMBED_ORIGINS` env var** — defined in `packages/env/server.ts`. Verify: `grep -n "ALLOWED_EMBED_ORIGINS" packages/env/server.ts`.
- [ ] **i18n translations for share/embed pages** — file: `apps/web/lib/translations.ts` plus runtime-data-attribute plumbing; build-time env `NEXT_PUBLIC_UI_LANGUAGE` in `packages/env/build.ts`. Verify: `ls apps/web/lib/translations.ts && grep -rn "translations" apps/web/app/s/ apps/web/app/embed/ | head && grep -n "NEXT_PUBLIC_UI_LANGUAGE" packages/env/build.ts`.
- [ ] **AI skeleton loading UX fix** — small patch in the share-page AI summary component. Verify by viewing a freshly uploaded video without any AI keys set — the AI summary skeleton should not spin indefinitely.

### Critical infrastructure patches

- [ ] **proxy.ts `/.well-known/` allow-list (workflow engine)** — file: `apps/web/proxy.ts`. Verify both the path allow-list entry and the matcher exclusion: `grep -n "well-known" apps/web/proxy.ts` should return at least two matches. Currently being upstreamed as **PR #1833** — if merged, drop our patch.
- [ ] **proxy.ts `/embed/` allow-list (self-hosted embeds)** — file: `apps/web/proxy.ts`. Verify: `grep -n "/embed/" apps/web/proxy.ts`.
- [ ] **Dockerfile workflow env vars** — file: `apps/web/Dockerfile`. Verify: `grep -n "WORKFLOW_\|PORT=3000" apps/web/Dockerfile`. Required runtime values: `WORKFLOW_TARGET_WORLD=local`, `WORKFLOW_LOCAL_BASE_URL=http://127.0.0.1:3000`, `WORKFLOW_LOCAL_DATA_DIR=.next/workflow-data`, `PORT=3000`. `127.0.0.1` (not `localhost`) is mandatory — Alpine resolves `localhost` to `::1` and the workflow self-dispatch silently times out.
- [ ] **`next.config.mjs` patches** — file: `apps/web/next.config.mjs`. Compare to upstream after rebase: `git diff main -- apps/web/next.config.mjs` should still show our intended deltas.
- [ ] **Transcription race fix in `transcribe.ts`** — currently being upstreamed as **PR #1832**. If merged upstream, drop our local guard (we already moved it to match the PR shape).

### Desktop identity (rarely synced — we only build web)

- [ ] **Tauri product identity** — file: `apps/desktop/src-tauri/tauri.conf.json`. Verify: `grep -n "Cap OARIS\|de.oaris.cap.desktop\|cap-oaris" apps/desktop/src-tauri/tauri.conf.json`. Required values: `productName: "Cap OARIS"`, `identifier: "de.oaris.cap.desktop"`, `mainBinaryName: "Cap OARIS"`, deep-link scheme `cap-oaris://`.

### CI patches

- [ ] **`ci.yml` trimmed to web-only** — file: `.github/workflows/ci.yml`. Verify no desktop/Rust/macOS/Windows jobs reintroduced: `grep -n "runs-on:.*macos\|runs-on:.*windows\|cargo\|tauri\|clippy" .github/workflows/ci.yml` should return nothing.
- [ ] **`docker-build-web.yml` auto-trigger on `oaris/deploy`** — file: `.github/workflows/docker-build-web.yml`. Verify: `grep -n "oaris/deploy" .github/workflows/docker-build-web.yml`.
- [ ] **`docker-build-proposal.yml` exists** — file: `.github/workflows/docker-build-proposal.yml`. Verify: `ls .github/workflows/docker-build-proposal.yml`. Builds `:proposal-<name>` images on push to `proposal/**`.
- [ ] **`cleanup-caches.yml` kept** — file: `.github/workflows/cleanup-caches.yml`. Verify: `ls .github/workflows/cleanup-caches.yml`. Weekly prune keeps us under the 2 GB GHA cache free tier.
- [ ] **Removed-upstream workflows stay removed** — verify: `ls .github/workflows/performance-regressions.yml .github/workflows/publish.yml 2>&1` should report both as missing. If either reappears via merge, delete it.

### Configuration that affects deployment

- [ ] **`pnpm-lock.yaml` regenerated if any `package.json` changed** — covered in Phase 4 above. Skipping causes `ERR_PNPM_OUTDATED_LOCKFILE` in Docker builds.
- [ ] **`packages/env/server.ts` env additions intact** — verify: `grep -n "ALLOWED_EMBED_ORIGINS\|DEEPGRAM_API_URL\|MISTRAL_API_KEY\|MISTRAL_API_URL\|AI_RESPONSE_LANGUAGE" packages/env/server.ts`.
- [ ] **`packages/env/build.ts` `NEXT_PUBLIC_UI_LANGUAGE` addition** — verify: `grep -n "NEXT_PUBLIC_UI_LANGUAGE" packages/env/build.ts` returns matches in both the schema and `runtimeEnv` blocks. Powers the i18n UI-language default for share/embed pages.

---

## Post-Sync Smoke Tests

Run on staging before promoting to production.

1. **Build green** — `pnpm typecheck && pnpm lint` (or rely on CI to do this; verify the staging Docker build completed).
2. **Container boots** — staging service reports healthy in your orchestrator, log stream shows the Next.js server bound to port 3000.
3. **Record and upload** — sign in to staging, record a short video via the web recorder (or desktop app pointing at staging), upload completes.
4. **Workflow engine fires** — container logs show `[video-processing]` and `[world-local]` lines (no 307 redirects to `/login`). To probe directly:
   ```bash
   docker exec <staging-container> node -e "fetch('http://127.0.0.1:3000/.well-known/workflow/v1/flow',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>console.log('status:',r.status))"
   ```
   Expected: `500` (workflow error, but route is handled). Bad: `307` (proxy is blocking workflow routes — the `/.well-known/` allow-list is missing).
5. **Transcript renders** — open the share page; transcript appears within a reasonable wait (depends on Voxtral/Deepgram latency).
6. **AI summary renders** (if `MISTRAL_API_KEY` or fallback set) — title/summary populate on the share page.
7. **Embed page loads in an iframe** — embed the staging share URL in any sandboxed iframe; player loads, controls work, branding is visible.
8. **Branding visible** — share and embed pages show oaris wordmark, brand color, custom favicon, `| oaris` in page title.
9. **Email delivery** — request a magic-link login; confirm sender name and template say "oaris".
10. **No analytics in Network tab** — open a share page in incognito DevTools; verify no PostHog / Meta / Google Ads requests.

Only after all of the above pass: do the Phase 6 production cutover.

---

## Upstream PR Tracking

We have local patches that exist to fix upstream bugs. When the corresponding upstream PR merges, our local patch becomes dead weight and should be dropped on the next sync.

After Phase 3 rebase, for each in-flight upstream PR:

```bash
git log --grep="<PR number>" main
git log --grep="<short SHA from PR>" main
```

If the search hits a commit on `main` (which now includes the latest upstream), the patch landed — drop our local version during conflict resolution. If it doesn't hit, keep our patch.

Current in-flight upstream PRs (drop the matching local patch when these merge):

| Upstream PR | Local patch lives in | Drop trigger |
|---|---|---|
| [CapSoftware/Cap#1832](https://github.com/CapSoftware/Cap/pull/1832) | Transcription race guard in `apps/web/lib/transcribe.ts` | When merged, drop our `transcribe.ts` guard. |
| [CapSoftware/Cap#1833](https://github.com/CapSoftware/Cap/pull/1833) | `/.well-known/` allow-list in `apps/web/proxy.ts` | When merged, drop both the path allow-list entry and the matcher exclusion in `proxy.ts`. |

For the most up-to-date list of in-flight PRs, see the "Upstream PR Tracker" section of the private ops doc `.oaris/DEPLOYMENT.md` (operator-only).

---

## Cache Cleanup

`.github/workflows/cleanup-caches.yml` prunes old GHA caches weekly so we stay under the 2 GB free tier. After a heavy sync (large lockfile churn, Docker layer changes) it can be worth running manually:

```bash
gh workflow run "Cleanup Actions Caches" --repo oaris-dev/Cap
```

Check current cache usage at the repo's Actions → Caches view.

---

## Disabled Upstream Workflows

When syncing with upstream, **do not re-add** the following workflow files:

| Workflow | File | Reason |
|---|---|---|
| Performance Regressions | `performance-regressions.yml` | Weekly cron benchmarking desktop media pipeline on macOS/Windows. Expensive, not relevant to our use case. |
| Publish | `publish.yml` | Desktop app release pipeline via CrabNebula. We don't publish desktop releases. |

If an upstream sync re-introduces these files via merge conflict, resolve by keeping them deleted.

---

## Workflows We Keep

| Workflow | File | Notes |
|---|---|---|
| CI | `ci.yml` | **Trimmed to web-only** (typecheck + Biome). Removed desktop builds, Clippy, Rust cache, cargo fmt — all macOS/Windows runner jobs stripped. On upstream sync, keep our slimmed version. |
| Docker Build Web | `docker-build-web.yml` | Auto-triggers on push to `oaris/deploy`; manual `workflow_dispatch` for `oaris/staging`. |
| Docker Build Media Server | `docker-build-media-server.yml` | Triggers on media-server path changes. |
| Test Self-Hosting | `test-self-hosting.yml` | Validates Docker Compose setup. |
| Validate Migrations | `validate-migration-journal.yml` | PR-only, lightweight. |
| Cleanup Actions Caches | `cleanup-caches.yml` | **Do not delete.** Weekly prune of Docker build caches to stay under 2 GB free tier. |
| Docker Build Proposal | `docker-build-proposal.yml` | Builds upstream-PR-proposal images from `proposal/**` branches. See "Upstream Proposal Workflow" below. |

---

## Upstream Proposal Workflow

When validating a fix we plan to submit upstream, we test it against a **clean upstream baseline** (not our oaris fork) on a separate environment.

**Architecture:**

```
upstream/main ──> proposal/<name>  (upstream + minimal proposal patch)
                       │
                       └──> ghcr.io/oaris-dev/cap-web:proposal-<name>
```

**Decisions:**
- DB: separate from staging
- S3: shared with staging (test data is fine to mix)
- Image tag: per-branch `:proposal-<branch-suffix>` (multiple proposals can coexist)
- CI trigger: push to `proposal/**` only (no manual dispatch)

**Creating a proposal branch:**

```bash
git fetch upstream main
git checkout -b proposal/<descriptive-name> upstream/main
git checkout oaris/deploy -- .github/workflows/docker-build-proposal.yml
git commit -m "ci: add proposal build workflow"
# ... edit files, commit the proposal patch ...
git push origin proposal/<descriptive-name>
```

CI will publish `ghcr.io/oaris-dev/cap-web:proposal-<descriptive-name>`. Point your proposal validation environment at that tag and verify the fix end-to-end before opening the upstream PR.

**Cleanup after PR is merged or closed:**

```bash
git push origin --delete proposal/<descriptive-name>
```

---

## See Also

- `.oaris/CLAUDE.md` — fork-level invariants, branch strategy details, branding reference (operator-only, private).
- `.oaris/DEPLOYMENT.md` — production deployment checklist, upstream PR tracker, container-platform specs (operator-only, private).
- [Issue #25](https://github.com/oaris-dev/Cap/issues/25) — original CI/workflow audit that motivated the trimmed workflow set.
