# ARC LABS LMS & AIoT Learning Platform

Monorepo for the ARC LABS learning platform (V1 = LMS).

## Stack (decided in Step 1)
| Area | Choice |
|---|---|
| Package manager / monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router) + React + TypeScript |
| API | NestJS + TypeScript, REST `/api/v1`, OpenAPI/Swagger |
| ORM / migrations | Prisma |
| Database | PostgreSQL 16 |
| Cache / queues | Redis 7 + BullMQ |
| Object storage | S3-compatible (MinIO locally) |
| Auth | JWT access token + rotating refresh token (httpOnly cookie), argon2 password hashing |
| Validation | Zod (shared in `packages/validation`) |
| Tests | Vitest/Jest (unit), Supertest (API integration), Playwright (E2E later) |
| CI | GitHub Actions |
| Local infra | Docker Compose |

## Planned layout
```
apps/      web/  api/  worker/
packages/  ui/  types/  config/  validation/
infra/     docker/  deployment/
docs/      prd/  api/  architecture/  decisions/
```

## Roadmap
- Step 1 – Setup decisions  ✅
- Step 2 – Phase 0 specs (ERD, RBAC matrix, API contract, wireframes)
- Step 3 – Monorepo scaffold
- Step 4 – Phase 1: Auth, RBAC, organizations, users, courses
- Step 5 – Phases 2–4
