# Tenancy & RBAC (V1)

## 1. Identity
- Firebase Auth owns credentials. API receives `Authorization: Bearer <Firebase ID token>`.
- `FirebaseAuthGuard` verifies the token (firebase-admin) → loads `users` by `firebaseUid`.
  Unknown uid → 403 unless the route is `POST /auth/sync` (first login / self-signup).
- Suspended users (`users.status != ACTIVE`) → 403 on every route.

## 2. Organization context
- Client sends `X-Org-Id: <organizationId>` (the org selected in the UI).
- `TenantGuard` loads the caller's `organization_users` row for that org; missing or inactive → 403.
- The request gets `ctx = { userId, orgId, roles[], isSuperAdmin }`.
- **Every repository query for org-owned data includes `where: { organizationId: ctx.orgId }`**
  (implemented once in a Prisma client extension, not repeated by hand).
- Resources fetched by id from another org return **404** (not 403) to avoid leaking existence.
- Super Admin may act in any org by passing `X-Org-Id`; all such actions are audit-logged.
- Public routes (catalog, certificate verify) need no token and expose only whitelisted fields.

## 3. Roles
Platform: **Super Admin** (`users.isSuperAdmin`).
Per organization (`organization_users.roles`, a user can hold several):
**ORG_ADMIN, CONTENT_MANAGER, INSTRUCTOR, EVALUATOR, LEARNER**.

Scope qualifiers used below:
- **own** = records where the caller is the learner/owner.
- **assigned** = batches where the caller is in `batch_instructors` (and their learners, sessions, submissions).

## 4. Permission matrix
Legend: ✅ full · 🔸 scoped (see note) · 👁 read-only · — none

| Resource / action | Super Admin | Org Admin | Content Mgr | Instructor | Evaluator | Learner |
|---|---|---|---|---|---|---|
| Organizations: create / suspend | ✅ | — | — | — | — | — |
| Organization settings & branding | ✅ | ✅ | — | — | — | — |
| Departments | ✅ | ✅ | — | — | — | — |
| Users: invite / edit / deactivate | ✅ | ✅ | — | — | — | — |
| Assign org roles | ✅ | ✅ (not Super Admin) | — | — | — | — |
| Own profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Courses / modules / lessons: create, edit | ✅ | ✅ | ✅ | — | — | — |
| Courses: publish / archive | ✅ | ✅ | ✅ | — | — | — |
| Courses: view | ✅ | ✅ | ✅ | 🔸 assigned + published | 👁 | 🔸 enrolled + public catalog |
| Question bank / quizzes: author | ✅ | ✅ | ✅ | 🔸 for assigned batches | — | — |
| Programs | ✅ | ✅ | 👁 | 👁 | — | — |
| Batches: create / edit / assign instructors | ✅ | ✅ | — | — | — | — |
| Batches: view | ✅ | ✅ | 👁 | 🔸 assigned | 🔸 assigned | 🔸 own |
| Enroll learners | ✅ | ✅ | — | 🔸 assigned batches | — | 🔸 self-enroll where allowed |
| Sessions: schedule | ✅ | ✅ | — | 🔸 assigned | — | — |
| Attendance: mark | ✅ | ✅ | — | 🔸 assigned | — | — |
| Attendance: view | ✅ | ✅ | — | 🔸 assigned | — | 🔸 own |
| Lesson progress | 👁 | 👁 | — | 👁 assigned | — | 🔸 own (write) |
| Quiz attempts | 👁 | 👁 | — | 👁 assigned | 👁 assigned | 🔸 own (attempt) |
| Assignments: create | ✅ | ✅ | ✅ | 🔸 assigned | — | — |
| Assignment submissions: submit | — | — | — | — | — | 🔸 own |
| Assignment submissions: grade | ✅ | ✅ | — | 🔸 assigned | 🔸 assigned | — |
| Projects & rubrics: create | ✅ | ✅ | ✅ | 🔸 assigned | — | — |
| Project submissions: submit | — | — | — | — | — | 🔸 own |
| Project evaluation | ✅ | ✅ | — | 🔸 assigned | 🔸 assigned | — |
| Certificate templates | ✅ | ✅ | — | — | — | — |
| Certificates: issue / revoke | ✅ | ✅ | — | — | — | — |
| Certificates: view / download | ✅ | ✅ | — | 👁 assigned | — | 🔸 own |
| Certificate public verify | public | public | public | public | public | public |
| Analytics dashboard | ✅ platform-wide | ✅ org | 👁 content stats | 🔸 assigned batches | — | 🔸 own progress |
| Audit logs | ✅ | 👁 org | — | — | — | — |

## 5. Implementation
- Permissions are code constants (`packages/types/permissions.ts`), e.g. `course.publish`, `attendance.mark`.
  Role → permission mapping lives in one file; the `roles/permissions` DB tables from the PRD are
  deferred until custom roles are needed.
- NestJS: `@RequirePermission('attendance.mark')` decorator + `PermissionGuard`.
  Scope checks (own / assigned) run in the service layer through a shared `AccessPolicy` service.
- Frontend hides actions by the same permission constants, but **the backend is the only enforcement point**.

## 6. Required tests (Definition of Done)
- A user of Org A gets 404 for every Org B resource id across all modules.
- Instructor cannot read/mark attendance for a batch they're not assigned to.
- Learner cannot read another learner's submission, attempt, progress or certificate.
- Learner endpoints never return `questions.correctAnswer` before submission.
- Certificate verify returns only: number, recipient name, title, org name, issue date, status.
- Auth + verify endpoints are rate-limited.
