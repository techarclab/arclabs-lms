# ADR 0002 – Firebase hybrid architecture

Status: Accepted (Sept 2026) — amends ADR 0001 (auth, storage, hosting)

## Context
ARC LABS already has a Firebase subscription. The LMS data is highly relational
(orgs → programs → batches → enrollments → attendance/assessments → certificates)
and needs reporting and strict tenant isolation, which Firestore handles poorly.

## Decision
Use Firebase for platform services, keep PostgreSQL as the system of record.

| Concern | Service |
|---|---|
| Identity / login / password reset / Google sign-in | Firebase Authentication |
| Files (videos, PDFs, submissions, certificates) | Firebase Storage (Cloud Storage bucket) |
| Push notifications | Firebase Cloud Messaging |
| Web hosting | Firebase App Hosting (Next.js) |
| API + worker hosting | Google Cloud Run (same GCP project) |
| Database | PostgreSQL on Cloud SQL, provisioned via Firebase SQL Connect; accessed by NestJS through Prisma |
| Queues / cache | Redis (Memorystore or Upstash) + BullMQ |

### Auth flow
1. Web signs the user in with the Firebase JS SDK and gets an ID token.
2. Every API call sends `Authorization: Bearer <Firebase ID token>`.
3. NestJS `FirebaseAuthGuard` verifies it with firebase-admin and loads the
   Postgres `users` row by `firebase_uid`.
4. Roles and organization membership live in Postgres (`organization_users`);
   `RolesGuard` + `TenantGuard` enforce RBAC and org isolation on every request.
5. Admin-created users (instructors, learners in bulk) are created via firebase-admin, then a password-reset/invite link is emailed.

### Files
Uploads go straight from browser to Firebase Storage using API-issued signed
upload URLs; Postgres stores only metadata/paths. Storage security rules deny
direct client reads — downloads use short-lived signed URLs from the API.

### Local development
Docker Compose: Postgres 16, Redis 7, Mailpit. Firebase Emulator Suite: Auth, Storage.

## Not used
Firestore as primary database (weak for joins, aggregates, reporting and tenant rules).
Firestore/Realtime DB may later be used for live features (e.g. lab/IoT live status).

## Consequences
- No custom password storage or refresh-token logic to build or secure.
- Vendor lock-in limited to auth/storage; data stays in portable PostgreSQL.
- Requires a Firebase project on the Blaze (pay-as-you-go) plan for Cloud SQL/Cloud Run.
