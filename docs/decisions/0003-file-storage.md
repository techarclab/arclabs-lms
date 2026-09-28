# ADR 0003 – File storage: S3-compatible (Cloudflare R2), not Firebase Storage

Status: Accepted (Sept 2026) — supersedes the storage part of ADR 0002

## Context

Firebase Storage now requires the Blaze (pay-as-you-go) plan. We want to start
without a paid plan and keep storage portable.

## Decision

- **Production:** Cloudflare R2 (10 GB/month free, zero egress fees, S3 API).
- **Local development:** MinIO in Docker (S3 API).
- **Code:** one `StorageService` using the AWS S3 SDK; switching provider
  (R2 / MinIO / Backblaze B2 / AWS S3 / GCS) is configuration only:
  `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Bucket is private. Browser uploads/downloads use short-lived **presigned URLs** issued by the API
  after authorization checks. Postgres stores only object keys + metadata.
- **Course videos:** V1 lessons reference external video URLs (YouTube unlisted). A protected
  video provider (Bunny Stream / Vimeo / Cloudflare Stream) can be added later behind the same lesson model.

## Unchanged from ADR 0002

Firebase Authentication (free tier, no Blaze needed) for identity; PostgreSQL as system of record.

## Object key layout

`org/{organizationId}/{area}/{entityId}/{uuid}-{safeFileName}`
areas: `courses`, `lessons`, `submissions`, `projects`, `certificates`, `branding`, `avatars`.
