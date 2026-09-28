# Database design (V1)

Source of truth: [`apps/api/prisma/schema.prisma`](../../../apps/api/prisma/schema.prisma) — Prisma 7, PostgreSQL 16.

## Conventions

- UUID primary keys; table names snake_case via `@@map`.
- Every organization-owned table has `organizationId` (indexed).
- Child tables that are always reached through a scoped parent (modules, lessons,
  sessions, quiz_questions, program_courses, batch_instructors, project_evaluations)
  inherit the parent's organization instead of repeating the column.
- Snapshots on certificates (`recipientName`, `title`) so reissued names/course renames never change an issued certificate.
- Quiz `correctAnswer` is never returned by learner-facing endpoints.
- Extra constraints added in raw SQL migrations:
  - `enrollments`: CHECK exactly one of `course_id` / `program_id` is set.
  - `batches`: CHECK at least one of `program_id` / `course_id` is set.
  - `attendance`, `submissions`, `quiz_attempts`: `organization_id` must equal parent's (enforced by service layer + tests).

## Entity overview

```mermaid
erDiagram
  ORGANIZATION ||--o{ DEPARTMENT : has
  ORGANIZATION ||--o{ ORGANIZATION_USER : has
  USER ||--o{ ORGANIZATION_USER : "member of"
  ORGANIZATION ||--o{ COURSE : owns
  COURSE ||--o{ COURSE_MODULE : contains
  COURSE_MODULE ||--o{ LESSON : contains
  LESSON ||--o{ LESSON_RESOURCE : has
  ORGANIZATION ||--o{ PROGRAM : owns
  PROGRAM ||--o{ PROGRAM_COURSE : includes
  COURSE ||--o{ PROGRAM_COURSE : "part of"
  ORGANIZATION ||--o{ BATCH : runs
  PROGRAM ||--o{ BATCH : "delivered as"
  COURSE ||--o{ BATCH : "delivered as"
  BATCH ||--o{ BATCH_INSTRUCTOR : "taught by"
  BATCH ||--o{ SESSION : schedules
  SESSION ||--o{ ATTENDANCE : records
  BATCH ||--o{ ENROLLMENT : enrolls
  USER ||--o{ ENROLLMENT : has
  USER ||--o{ PROGRESS : tracks
  LESSON ||--o{ PROGRESS : "tracked by"
  QUIZ ||--o{ QUIZ_QUESTION : has
  QUESTION ||--o{ QUIZ_QUESTION : "used in"
  QUIZ ||--o{ QUIZ_ATTEMPT : has
  ASSIGNMENT ||--o{ SUBMISSION : receives
  PROJECT ||--o{ PROJECT_SUBMISSION : receives
  RUBRIC ||--o{ PROJECT : grades
  PROJECT_SUBMISSION ||--o{ PROJECT_EVALUATION : "evaluated by"
  CERTIFICATE_TEMPLATE ||--o{ CERTIFICATE : renders
  USER ||--o{ CERTIFICATE : earns
  USER ||--o{ NOTIFICATION : receives
  ORGANIZATION ||--o{ AUDIT_LOG : logs
```

## Deferred to V2+ (not in schema yet)

devices / device_credentials / device_telemetry, labs / experiments / lab_submissions,
payments, internships, community. Lesson type `LAB` is reserved so the content model doesn't change.
