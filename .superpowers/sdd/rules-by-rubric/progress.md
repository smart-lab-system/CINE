# rules-by-rubric progress — A0 baseline (2026-10-08T13:30:51.2839532+07:00)

## Environment
- Branch: feature/rules-summary-copy (current checkout, no worktree)
- Docs: docs/add/... present
- Docker: cine-postgres-1, cine-minio-1, cine-redis-1 up
- Migrations: no pending (through 1789540000000-AddExamSessionSemesterRoomFk)
- MinIO mc image pull failed (minio/mc not available); minio health 200

## Full e2e (interrupted / polluted)
- Symptom: nearly every suite FAIL on afterAll app.close() Exceeded timeout 30000ms
- Root cause (observed): Nest app.close() leaves open handles (Jest suggests --detectOpenHandles); concurrent nest --watch / dist main were killed before re-run
- Not attributed to rules-by-rubric (no code changes yet)

## Rules-related subset (--forceExit)
Command: npx jest --config ./test/jest-e2e.json --runInBand --forceExit rules-prices rules-routes score-service rule-entries
- Tests: 27 passed, 1 failed, 28 total
- Suites: 4 failed (all due to afterAll timeout after tests ran)
- Real assertion failure: rules-routes `đánh dấu tiêu chí…` — duplicate key uq_class_legacy_teacher_name in seedSession (DB pollution / race with full suite). Re-check in isolation later.
- Force exiting Jest: open handles after suite

## Unit
- (pending next step)

## Decision
Proceed to A1 (additive schema). Treat afterAll hangs as known pre-existing env debt; re-verify rules-related assertions after A1/A2 cutover.

## A10 rules-related e2e (2026-10-08)
Command: npx jest --config ./test/jest-e2e.json --runInBand --forceExit (rules-related pattern)
- Test Suites: 16 passed, 16 total
- Tests: 88 passed, 88 total
- rehearsal CLI ensureRubricAndRules → POST /rubric-errors
