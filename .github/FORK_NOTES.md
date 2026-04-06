# Fork Notes (oaris-dev/cap)

This is a fork of [CapSoftware/Cap](https://github.com/CapSoftware/Cap) maintained for our freelance agency.

## Disabled Upstream Workflows

When syncing with upstream, **do not re-add** the following workflow files:

| Workflow | File | Reason |
|---|---|---|
| Performance Regressions | `performance-regressions.yml` | Weekly cron benchmarking desktop media pipeline on macOS/Windows. Expensive, not relevant to our use case. |
| Publish | `publish.yml` | Desktop app release pipeline via CrabNebula. We don't publish desktop releases. |

If an upstream sync re-introduces these files via merge conflict, resolve by keeping them deleted.

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
