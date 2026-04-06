# Fork Notes (oaris-dev/cap)

This is a fork of [CapSoftware/Cap](https://github.com/CapSoftware/Cap) maintained for our freelance agency.

## Disabled Upstream Workflows

When syncing with upstream, **do not re-add** the following workflow files:

| Workflow | File | Reason |
|---|---|---|
| Performance Regressions | `performance-regressions.yml` | Weekly cron benchmarking desktop media pipeline on macOS/Windows. Expensive, not relevant to our use case. |
| Publish | `publish.yml` | Desktop app release pipeline via CrabNebula. We don't publish desktop releases. |

If an upstream sync re-introduces these files via merge conflict, resolve by keeping them deleted.

## Post-Sync Checklist

After every upstream sync:

1. **Re-trim `ci.yml`** if upstream changes overwrote our slimmed version (keep only typecheck + Biome jobs, remove all desktop/Rust/macOS/Windows jobs).
2. **Re-delete** `performance-regressions.yml` and `publish.yml` if they reappear.
3. **Cancel any triggered runs** — the sync push to `main` may trigger workflow runs before the trimmed/deleted files take effect. Go to [Actions](https://github.com/oaris-dev/Cap/actions), find any in-progress runs from the sync commit, and cancel them manually to avoid wasting CI minutes and noisy failure notifications.

## Workflows We Keep

| Workflow | File | Notes |
|---|---|---|
| CI | `ci.yml` | **Trimmed to web-only** (typecheck + Biome). Removed desktop builds, Clippy, Rust cache, cargo fmt — all macOS/Windows runner jobs stripped. On upstream sync, keep our slimmed version. |
| Docker Build Web | `docker-build-web.yml` | Manual trigger only |
| Docker Build Media Server | `docker-build-media-server.yml` | Triggers on media-server path changes |
| Test Self-Hosting | `test-self-hosting.yml` | Validates Docker Compose setup |
| Validate Migrations | `validate-migration-journal.yml` | PR-only, lightweight |
| OpenCode | `opencode.yml` | AI coding via issue comments |

## Reference

See [issue #25](https://github.com/oaris-dev/Cap/issues/25) for the full audit.
