# Examination engine

Code: `apps/api/src/exams/` · UI: `apps/web/src/app/(app)/{exams,questions,my-exams}`, `apps/web/src/app/exam/[id]`

## Lifecycle

```
Question bank → Exam (DRAFT) → questions + schedule + audience → PUBLISHED
   → SCHEDULED (before window) → LIVE (window open) → ENDED (window closed)
```

Publishing requires: ≥1 question, duration, a window that closes in the future and is at least as
long as the duration, and ≥1 assigned learner. After publishing, questions and scoring/lockdown
settings are **locked** (only title, instructions, results policy and extending the close time can
change). Questions used by a published exam are read-only in the bank (duplicate to edit).
An exam can be unpublished only while nobody has started it.

## Attempt rules (server-enforced)

| Rule                                                                                                                                                   | Where                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Only assigned, active learners of an active organization can see/start                                                                                 | `ExamEngine.isAssigned`               |
| Question and option order shuffled per student and frozen at start                                                                                     | `AttemptsService.start`               |
| Answer key and explanations are never sent while writing                                                                                               | `AttemptsService.session`             |
| Deadline = min(start + duration, window close); saves refused 5 s after it                                                                             | `liveAttempt`                         |
| One active browser session (`X-Attempt-Session`); starting elsewhere takes over and counts a violation if the old one was active in the last 20 s      | `start`, `liveAttempt`                |
| Answers saved atomically per question (`jsonb_set`)                                                                                                    | `saveAnswer`                          |
| Violations: full-screen exit, tab hidden, window blur, devtools, session takeover — debounced 2.5 s; copy/paste/right-click are logged but not counted | `recordEvent`                         |
| Auto-submit when violations reach the exam’s limit                                                                                                     | `recordEvent` → `ExamEngine.finalize` |
| Expired attempts are graded lazily on every read path (time up / window closed)                                                                        | `ExamEngine.finalizeExpired`          |
| Grading is idempotent (conditional update)                                                                                                             | `ExamEngine.finalize`                 |

## Scoring

`grading.ts` (pure, unit-tested): exact-set match for multiple choice, tolerance for numeric,
negative marks only for answered-and-wrong when the exam enables negative marking, total floored
at 0, pass = percentage ≥ pass mark. Ranks use competition ranking over each candidate’s best
attempt; percentile = share of candidates strictly below.

## Results visibility

| Policy                                   | Score & rank            | Answer review           |
| ---------------------------------------- | ----------------------- | ----------------------- |
| Score now, answers after close (default) | immediately             | after the window closes |
| Immediate                                | immediately             | immediately             |
| Manual release                           | after “Release results” | after “Release results” |

## Staff analytics

Submitted/absent/writing counts, average, median, highest/lowest, pass rate, average time, 10-bucket
score distribution, topic performance, department comparison, per-question correct rate, option
choice distribution and discrimination index (top 27% vs bottom 27%), integrity flags per candidate
with a timestamped event log, CSV export, and “end this attempt now”.
