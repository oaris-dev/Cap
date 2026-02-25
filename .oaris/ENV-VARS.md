# Environment Variables Reference

All environment variables for the Cap web application. Variables marked **required** must be set; all others are optional.

Source: `packages/env/server.ts` (server) and `packages/env/build.ts` (build/client).

---

## Core (required)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL database connection URL |
| `WEB_URL` | Public URL of your instance, e.g. `https://cap.oaris.de` |
| `NEXTAUTH_SECRET` | 32-byte base64 string for session encryption |
| `NEXTAUTH_URL` | Should be the same as `WEB_URL` |
| `NEXT_PUBLIC_WEB_URL` | Public URL (client-side). Falls back to `WEB_URL` |

## S3 Storage (required)

Works with any S3-compatible provider (AWS, MinIO, Hetzner, Cloudflare R2, etc.).

| Variable | Required | Description |
|----------|----------|-------------|
| `CAP_AWS_BUCKET` | Yes | Bucket name |
| `CAP_AWS_REGION` | Yes | Region, e.g. `eu-central-1` |
| `CAP_AWS_ACCESS_KEY` | No | Access key (not needed with IAM roles) |
| `CAP_AWS_SECRET_KEY` | No | Secret key |
| `S3_PUBLIC_ENDPOINT` | No | Public endpoint URL. Also settable as `CAP_AWS_ENDPOINT` |
| `S3_INTERNAL_ENDPOINT` | No | Internal/private endpoint (saves egress if S3 is on same network) |
| `S3_PATH_STYLE` | No | `true` (default) for path-style URLs (`/{bucket}/{key}`), `false` for virtual-hosted |
| `CAP_AWS_BUCKET_URL` | No | Public URL of the bucket (set to CloudFront URL if using CDN) |

## Email (Resend)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for sending login codes and notifications |
| `RESEND_FROM_DOMAIN` | Sender domain, e.g. `cap.oaris.de` |

## Authentication

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (enables Google login) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `WORKOS_CLIENT_ID` | WorkOS client ID (enterprise SSO) |
| `WORKOS_API_KEY` | WorkOS API key |

## AI Providers

Fallback chain for metadata generation: Mistral -> Groq -> OpenAI.
At least one must be set for AI features (title, summary, chapters, translation).

| Variable | Description |
|----------|-------------|
| `MISTRAL_API_KEY` | Mistral API key. EU-hosted, GDPR-compliant. Primary provider when set |
| `GROQ_API_KEY` | Groq API key. Used for AI summaries and as fallback |
| `OPENAI_API_KEY` | OpenAI API key. Last fallback for AI summaries |
| `ANTHROPIC_API_KEY` | Anthropic API key. Used for AI chat feature |

## Transcription (Deepgram)

| Variable | Description |
|----------|-------------|
| `DEEPGRAM_API_KEY` | Deepgram API key for audio transcription |
| `DEEPGRAM_API_URL` | Custom Deepgram endpoint. Set to `https://api.eu.deepgram.com` for EU data residency. Omit to use default US endpoint |

## Audio Enhancement

| Variable | Description |
|----------|-------------|
| `REPLICATE_API_TOKEN` | Replicate API token for audio enhancement (Pro feature) |

## Media Server

The media server handles FFmpeg processing. Required if not running FFmpeg locally.

| Variable | Description |
|----------|-------------|
| `MEDIA_SERVER_URL` | URL of the media server, e.g. `http://media-server:3001` |
| `MEDIA_SERVER_WEBHOOK_SECRET` | Shared secret for authenticating webhook callbacks |
| `MEDIA_SERVER_WEBHOOK_URL` | Base URL for callbacks. Use `http://host.docker.internal:3000` for Docker setups |

## CloudFront CDN (optional)

Only needed if serving assets via CloudFront.

| Variable | Description |
|----------|-------------|
| `CAP_CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID |
| `CLOUDFRONT_KEYPAIR_ID` | CloudFront key pair ID for signed URLs |
| `CLOUDFRONT_KEYPAIR_PRIVATE_KEY` | CloudFront private key for signed URLs |

## Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CAP_VIDEOS_DEFAULT_PUBLIC` | `true` | Whether new videos are public by default |
| `CAP_ALLOWED_SIGNUP_DOMAINS` | (none) | Comma-separated list of allowed signup email domains |
| `DATABASE_ENCRYPTION_KEY` | (none) | 32-byte hex string for encrypting stored credentials |
| `AI_RESPONSE_LANGUAGE` | (none) | Language for AI-generated summaries, titles, and chapters (e.g. `de`, `fr`). Defaults to English if unset |

## Build / Client-side

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_WEB_URL` | Public URL (falls back to `WEB_URL`) |
| `NEXT_PUBLIC_DOCKER_BUILD` | Set to `true` to enable Next.js standalone output for Docker |
| `NEXT_PUBLIC_IS_CAP` | Set only on cap.so. When unset, self-hosting mode is active (all users treated as Pro) |
| `NEXT_PUBLIC_UI_LANGUAGE` | UI language for share/embed pages. `en` (default) or `de`. Set at build time |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL |

## Internal / Workflows

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production`, `development`, or `test` |
| `WORKFLOWS_RPC_URL` | URL for the workflow RPC service |
| `WORKFLOWS_RPC_SECRET` | Secret for workflow RPC authentication |

## Cap Cloud Only

These are only used on cap.so and not needed for self-hosting.

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Discord webhook for user feedback |
| `DISCORD_LOGS_WEBHOOK_URL` | Discord webhook for system logs |
| `TINYBIRD_HOST` | Tinybird analytics host |
| `TINYBIRD_TOKEN` | Tinybird analytics token |
| `POSTHOG_PERSONAL_API_KEY` | PostHog server-side key |
| `DUB_API_KEY` | Dub.co link shortener |
| `SUPERMEMORY_API_KEY` | Supermemory integration |
| `SUPERMEMORY_KNOWLEDGE_TAG` | Supermemory knowledge tag |
| `VERCEL_ENV` | `production`, `preview`, or `development` |
| `VERCEL_TEAM_ID` | Vercel team ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `VERCEL_AUTH_TOKEN` | Vercel auth token |
| `VERCEL_AWS_ROLE_ARN` | AWS role ARN for Vercel |

---

## OARIS Minimal Setup

The minimum env vars needed for a working OARIS deployment:

```env
# Core
DATABASE_URL=mysql://user:pass@host:3306/cap
WEB_URL=https://cap.oaris.de
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=https://cap.oaris.de
NEXT_PUBLIC_WEB_URL=https://cap.oaris.de
NEXT_PUBLIC_DOCKER_BUILD=true
NEXT_PUBLIC_UI_LANGUAGE=de

# S3 (Hetzner Object Storage)
CAP_AWS_BUCKET=your-bucket
CAP_AWS_REGION=eu-central-1
CAP_AWS_ACCESS_KEY=your-access-key
CAP_AWS_SECRET_KEY=your-secret-key
S3_PUBLIC_ENDPOINT=https://your-bucket.s3.eu-central-1.amazonaws.com
S3_PATH_STYLE=true

# Email
RESEND_API_KEY=re_xxxxx
RESEND_FROM_DOMAIN=cap.oaris.de

# AI (EU-compliant)
DEEPGRAM_API_KEY=your-deepgram-key
DEEPGRAM_API_URL=https://api.eu.deepgram.com
MISTRAL_API_KEY=your-mistral-key
AI_RESPONSE_LANGUAGE=de

# Media Server — these are pre-configured in the compose file.
# Only set manually if NOT using docker-compose-coolify-with-media-server.yml.
# MEDIA_SERVER_URL=http://media-server:3456
# MEDIA_SERVER_WEBHOOK_SECRET=<shared secret>
# MEDIA_SERVER_WEBHOOK_URL=http://cap-web:3000
```
