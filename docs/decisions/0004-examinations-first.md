# ADR 0004 – Examinations first

Status: Accepted (Sept 2026)

## Context

ARC LABS’ immediate need is running strict, fair online examinations for students of partner
institutions, with instant scores and analytics. Courses, batches and certificates are secondary.

## Decision

- Build the examination engine before courses. Courses, programs, batches and certificates stay
  on the roadmap ("coming soon" in the app).
- V1 question types are auto-graded: single choice, multiple choice (exact match), true/false and
  numeric (with tolerance). **Coding questions** follow as step 2 on the same engine
  (`QuestionType.CODING`, `questions.coding` JSON already in the schema) with a sandboxed code runner.
- Strictness: browser lockdown (full screen, tab/window switch detection, copy/paste/right-click/
  devtools blocking), one active session, server-enforced deadline, auto-submit after N violations.
- Results: default “score now, answers after the window closes”; alternatives are “immediately”
  and “manual release”.
- Audience: all learners of an organization, selected departments (learners only) and/or
  individually picked people.

## Consequences

- The server is the source of truth for time, answers and violations; the browser only reports.
- Browser lockdown deters and records cheating but cannot stop a second device. Webcam proctoring
  can be added later if needed.
