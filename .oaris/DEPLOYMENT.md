# Cap Production Deployment Checklist

Target: `cap.oaris.de` via Coolify on Hetzner

---

## Prerequisites

### 1. Docker Images (via GitHub Actions)

Push to `oaris/deploy` triggers `docker-build-web.yml` which builds and pushes:
- `ghcr.io/oaris-dev/cap-web:latest` (multi-arch: amd64 + arm64)

Media server uses upstream image (no branding):
- `ghcr.io/capsoftware/cap-media-server:latest`

Or trigger manually: Actions → Docker Build Web → Run workflow

### 2. S3 Bucket (Hetzner Object Storage)

- [ ] Create bucket: `oa-cap-prod` in `nbg1` region
- [ ] Generate S3 credentials in Hetzner Console
- [ ] Apply bucket policy (see HETZNER-S3.md)
- [ ] Configure CORS for `https://cap.oaris.de` (see HETZNER-S3.md)

### 3. Database (MySQL 8.0)

- [ ] MySQL instance provisioned (Docker Compose includes one, or use external)
- [ ] Database `cap` created
- [ ] Connection string ready

### 4. Email (Resend)

- [ ] Resend account created
- [ ] Sending domain `oaris.de` verified
- [ ] API key generated

---

## Coolify Setup

### Docker Compose Templates

Two Coolify-ready compose files in `.oaris/`:

| File | Services | Use case |
|------|----------|----------|
| `docker-compose-coolify.yml` | cap-web, cap-db | Minimal setup (no transcription) |
| `docker-compose-coolify-with-media-server.yml` | cap-web, cap-db, media-server | Full setup with transcription |

The media-server is required for Deepgram transcription (extracts audio via FFmpeg).
It uses upstream's image directly (`ghcr.io/capsoftware/cap-media-server:latest`) — no branding needed.

See `.oaris/ENV-VARS.md` for full environment variable reference.

### Environment Variables

```env
# Core
WEB_URL=https://cap.oaris.de
NEXTAUTH_URL=https://cap.oaris.de
NEXTAUTH_SECRET=<openssl rand -base64 32>
DATABASE_ENCRYPTION_KEY=<openssl rand -hex 32>
DATABASE_URL=mysql://user:pass@mysql:3306/cap

# S3 (Hetzner)
CAP_AWS_ACCESS_KEY=<key>
CAP_AWS_SECRET_KEY=<secret>
CAP_AWS_BUCKET=oa-cap-prod
CAP_AWS_REGION=nbg1
S3_PUBLIC_ENDPOINT=https://nbg1.your-objectstorage.com
S3_INTERNAL_ENDPOINT=https://nbg1.your-objectstorage.com
S3_PATH_STYLE=true

# Email
RESEND_API_KEY=<key>
RESEND_FROM_DOMAIN=oaris.de

# Self-hosting (DO NOT set NEXT_PUBLIC_IS_CAP=true)
# All Pro features unlocked by default when this is unset

# Analytics — DO NOT SET (keeps tracking disabled)
# NEXT_PUBLIC_POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_HOST=
# NEXT_PUBLIC_META_PIXEL_ID=
# NEXT_PUBLIC_GOOGLE_AW_ID=

# AI — Transcription (Deepgram EU)
# DEEPGRAM_API_KEY=<key>
# DEEPGRAM_API_URL=https://api.eu.deepgram.com

# AI — Metadata & Translation (Mistral preferred for EU)
# Fallback chain: Mistral -> Groq -> OpenAI
# MISTRAL_API_KEY=<key>
# GROQ_API_KEY=<key>
# OPENAI_API_KEY=<key>

# Optional domain restriction for signups
# CAP_ALLOWED_SIGNUP_DOMAINS=oaris.de
```

### Deploy

- [ ] Create service in Coolify
- [ ] Set domain: `cap.oaris.de`
- [ ] Paste environment variables
- [ ] Deploy and wait for healthy status

---

## Post-Deployment

### Initial Setup

- [ ] Access `https://cap.oaris.de`
- [ ] Create first user account
- [ ] Create organization
- [ ] Upload oaris organization logo via settings

### Verification

- [ ] Record a test video (desktop app or web recorder)
- [ ] Verify upload to S3: `aws s3 ls s3://oa-cap-prod/ --recursive --endpoint-url=$AWS_ENDPOINT_URL`
- [ ] Share video → open share link in incognito
- [ ] Verify oaris branding shows (not Cap)
- [ ] Verify "powered by Cap" attribution visible
- [ ] Check Network tab: no analytics requests (PostHog, Meta, etc.)
- [ ] Check embed player branding
- [ ] Test password protection on a video
- [ ] Test email delivery (login link)

### Security Verification

- [ ] No external analytics in browser Network tab
- [ ] No Intercom chat widget
- [ ] S3 bucket not publicly listable
- [ ] Presigned URLs expire correctly

---

## Monitoring & Maintenance

### Health Checks
- Coolify health check on web container
- Container restart policy set

### Backups
- MySQL backup scheduled
- S3 bucket versioning (optional)

### Upstream Sync (weekly/bi-weekly)
```bash
git fetch upstream --tags
git checkout main && git merge upstream/main --ff-only && git push origin main
git checkout oaris/deploy && git rebase main
git push origin oaris/deploy --force-with-lease
# CI rebuilds Docker image → Coolify auto-deploys
```

---

## Branch Strategy & Upstream Contributions

### Branch overview

```
upstream/main (CapSoftware/Cap) ── never commit here
    │
    v  (merge --ff-only)
main ──────────────────────────── pure upstream mirror
    │
    ├── feature/* ─────────────── always based on main (clean, no branding)
    │                              PR to oaris/deploy for testing
    │                              same branch can PR to upstream later
    │
    └── oaris/deploy ──────────── branding patches (rebased on main)
                                   CI builds Docker → Coolify deploys
```

### Key rule: feature branches always start from `main`

Feature branches must be created from `main`, never from `oaris/deploy`.
This keeps them free of branding code so the same branch can:

1. PR into `oaris/deploy` for testing on staging (cap.oaris.de)
2. PR directly to `CapSoftware/Cap` upstream without any rework

### What lives where

| Change type | Branch | Target |
|-------------|--------|--------|
| Branding (logos, fonts, colors, footer) | `oaris/deploy` | Stays in fork permanently |
| CI slimming (web-only) | `oaris/deploy` | Stays in fork permanently |
| Email template text (oaris name) | `oaris/deploy` | Stays in fork permanently |
| New features useful to all Cap users | `feature/*` (from `main`) | PR to CapSoftware/Cap |
| Bug fixes useful to all Cap users | `feature/*` (from `main`) | PR to CapSoftware/Cap |

### Workflow for upstream contributions

1. Create `feature/*` branch from `main` (clean upstream base)
2. Implement the feature (single squashed commit preferred)
3. PR to `oaris/deploy` for testing on staging (cap.oaris.de)
4. After testing, PR the same branch to `CapSoftware/Cap:main`
5. After upstream merges, sync `main` and rebase `oaris/deploy`
6. The feature drops off `oaris/deploy` naturally (it's now in `main`)

### Active issues (oaris-dev/Cap)

| Issue | Type | PR | Branch | Description |
|-------|------|----|--------|-------------|
| [#3](https://github.com/oaris-dev/Cap/issues/3) | bug | [#7](https://github.com/oaris-dev/Cap/pull/7) | `feature/fix-ai-skeleton-loading` | AI skeleton stays loading when keys not configured |
| [#2](https://github.com/oaris-dev/Cap/issues/2) | enhancement | [#8](https://github.com/oaris-dev/Cap/pull/8) | `feature/deepgram-eu-endpoint` | Add Deepgram EU endpoint option |
| [#1](https://github.com/oaris-dev/Cap/issues/1) | enhancement | [#9](https://github.com/oaris-dev/Cap/pull/9) | `feature/mistral-ai-provider` | Add Mistral API as GDPR-compliant AI provider |

### GDPR AI implementation (see .oaris/GDPR-AI-EVALUATION.md)

Recommended stack for EU compliance:
- **Deepgram EU** (`api.eu.deepgram.com`) for transcription
- **Mistral API** (La Plateforme, French company) for metadata + translation
- Total: ~$6.51/month for 500 videos

---

## Credentials Reference

| Item | Location |
|------|----------|
| S3 Access Key | Coolify env / Password Manager |
| S3 Secret Key | Password Manager |
| DATABASE_URL | Coolify env |
| NEXTAUTH_SECRET | Coolify env |
| DATABASE_ENCRYPTION_KEY | Coolify env |
| Resend API Key | Password Manager |
| GHCR | Automatic via GitHub Actions |

---

## Branding Reference

### Colors (applied inline in client-facing pages)

| Token | Value | Usage |
|-------|-------|-------|
| Brand Primary | `#3b7a6b` | CTA buttons, links, play button, tab underline |
| Brand Primary Hover | `#326b5d` | Hover state for above |
| Page Background | `oklch(0.992 0.005 78.25)` | Share page warm off-white |

### Files with Brand Colors

When rebasing, check these files for conflicts:

- `apps/web/app/s/[videoId]/page.tsx` — background, sign-in link
- `apps/web/app/s/[videoId]/_components/PasswordOverlay.tsx` — button
- `apps/web/app/s/[videoId]/_components/Sidebar.tsx` — tab underline
- `apps/web/app/s/[videoId]/_components/CapVideoPlayer.tsx` — play button, loading spinner logo
- `apps/web/app/s/[videoId]/_components/HLSVideoPlayer.tsx` — play button, loading spinner logo
- `apps/web/app/s/[videoId]/_components/AuthOverlay.tsx` — sign-in dialog logo
- `apps/web/app/embed/[videoId]/page.tsx` — sign-in link

### Logo Assets

- `apps/web/components/OarisLogo.tsx` — inline SVG component (avoids file loading issues in Docker)
- `apps/web/public/oaris-wordmark.svg` — wordmark for footer attribution
- Email templates use `CAP_LOGO_URL` from `packages/utils/src/helpers.ts` → `https://oaris.de/oaris-wortmarke-with-dot.png`

### Brand Name Style

- Always use lowercase "oaris" (not "OARIS" or "Oaris")
- Example: "Welcome to oaris!", "powered by Cap"

### Client-Facing Branding

All client-facing pages show:
- oaris logo/wordmark with link to `https://oaris.de`
- "powered by Cap" attribution with link to `https://cap.so`

### Completed Branding

- [x] Share page (`/s/[videoId]`) — footer with oaris wordmark + "powered by Cap"
- [x] Embed player (`/embed/[videoId]`) — oaris logo + "powered by Cap"
- [x] Password overlay — oaris logo
- [x] Auth overlay — oaris logo
- [x] Video player loading spinner — static oaris logo + spinner ring
- [x] Page metadata — "| oaris" suffix, "Watch this video on oaris"
- [x] Email templates — all use lowercase "oaris", `CAP_LOGO_URL` points to hosted wordmark
- [x] Email sender name — "oaris <no-reply@...>"

---

Last Updated: February 2026
