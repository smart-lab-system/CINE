# UI e2e seed

`seed.ts` boots a real Nest application context against the LOCAL database
(`.env.test`), inserts one teacher account and one investigator (code)
session with four grading results covering the states the Playwright suite
in `apps/web-e2e` exercises: a flagged result blocked by an unpriced rule,
a clean auto-approved result, and two "không chấm được" results (one
system-side, one submission-side).

It reuses the same raw-SQL helpers the backend e2e specs use
(`apps/api/test/helpers/*`), plus the real `ScoreService.computeInitial`
and `ScoreService.finishAttempt` so the written rows match exactly what
production writes — nothing here is hand-forged JSON standing in for a
real computation.

**Run once by hand:**

```bash
cd apps/api
DOTENV_CONFIG_PATH=.env.test npx ts-node -r tsconfig-paths/register test/ui-e2e/seed.ts
```

Writes `seed-output.json` (gitignored) with the teacher's login and the
four result ids. `apps/web-e2e/global-setup.ts` runs this automatically
before every Playwright run and logs in once to capture `storageState`.

**Prerequisites:** local Postgres/Redis/MinIO up (`docker compose up -d
postgres redis minio` from the repo root, not from a worktree), the
`examcollect-submissions` MinIO bucket created, and migrations applied —
see the project's e2e memory notes if any of these are missing.

**Not seeded:** a "dưới sàn" (score computed as null by a later recompute)
fixture. Tracing `decide()` showed every current `outcome: 'ungradable'`
branch is about the investigation/test-bundle itself, never about rules or
criterion waivers, and no shipped route can currently trigger the one
codepath (`recomputeOne`) that would persist a real null-score
computation. That rendering branch is covered by a plain unit test
instead (`ScoreCard.test.tsx`) — see the ledger at
`.superpowers/sdd/2026-09-28-grading-investigator-dossier/progress.md`
for the full trace.
