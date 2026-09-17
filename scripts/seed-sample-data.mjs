#!/usr/bin/env node
/**
 * Seed sample academic graph via the Seed API (idempotent).
 *
 *   pnpm seed:sample
 *   node scripts/seed-sample-data.mjs [--base URL] [--fixture path]
 *     [--admin-email email] [--password pw] [--update-passwords] [--dry-run]
 *
 * Password comes from SEED_BOOTSTRAP_PASSWORD (env or .env.seed.local).
 * Fixture JSON must not contain password fields.
 *
 * Spec: docs/superpowers/specs/2026-09-17-seed-sample-data-script-design.md
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DEFAULT_FIXTURE = join(__dirname, 'seed-fixtures', 'reference.json');
const DEFAULT_BASE = 'http://localhost:4000';
const ENV_CANDIDATES = [
  join(REPO_ROOT, '.env.seed.local'),
  join(__dirname, 'seed-fixtures', '.env.seed.local'),
];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const out = {
    base: undefined,
    fixture: undefined,
    adminEmail: undefined,
    password: undefined,
    updatePasswords: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      out.help = true;
      continue;
    }
    if (token === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (token === '--update-passwords') {
      out.updatePasswords = true;
      continue;
    }
    if (!token.startsWith('--')) {
      console.warn(`Ignoring unknown argument: ${token}`);
      continue;
    }

    const eq = token.indexOf('=');
    const key = eq !== -1 ? token.slice(2, eq) : token.slice(2);
    let value = eq !== -1 ? token.slice(eq + 1) : undefined;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        fail(`Flag --${key} requires a value.`);
      }
      value = next;
      i++;
    }

    switch (key) {
      case 'base':
        out.base = value;
        break;
      case 'fixture':
        out.fixture = value;
        break;
      case 'admin-email':
        out.adminEmail = value;
        break;
      case 'password':
        out.password = value;
        break;
      default:
        console.warn(`Ignoring unknown flag: --${key}`);
    }
  }

  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/seed-sample-data.mjs [options]

Options:
  --base <url>           API origin (default: API_BASE or ${DEFAULT_BASE})
  --fixture <path>       reference.json path
  --admin-email <email>  Override fixture admin email
  --password <pw>        Override SEED_BOOTSTRAP_PASSWORD (prefer .env.seed.local)
  --update-passwords     Send updatePassword:true on ensure account
  --dry-run              Print request bodies; do not fetch
  -h, --help             Show this help

Env:
  SEED_BOOTSTRAP_PASSWORD  Required (see scripts/seed-fixtures/.env.seed.example)
  API_BASE                 Optional API origin
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function summarize(step, status, body) {
  const row = { step, status };
  if (body && typeof body === 'object') {
    if (body.id !== undefined) row.id = body.id;
    if (body.created !== undefined) row.created = body.created;
    if (body.claimed !== undefined) row.claimed = body.claimed;
    if (body.added !== undefined) row.added = body.added;
    if (body.unchanged !== undefined) row.unchanged = body.unchanged;
    if (body.code !== undefined && typeof body.code === 'string' && !body.id) {
      row.code = body.code;
    }
  }
  console.log(JSON.stringify(row));
}

async function requestJson(base, method, path, { token, body, dryRun, step }) {
  const url = `${base.replace(/\/$/, '')}${path}`;
  if (dryRun) {
    console.log(JSON.stringify({ step, dryRun: true, method, path, body }));
    return { status: 0, body: { dryRun: true } };
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    if (code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')) {
      fail(
        `Cannot reach API at ${base} (${code ?? err.message}). Start the API first (pnpm --filter api dev).`,
      );
    }
    throw err;
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (response.status === 404) {
    fail(
      `${step}: 404 on ${path}. Enable SEED_API_ENABLED=true and restart the API.`,
    );
  }

  return { status: response.status, body: parsed };
}

function resolveFixturePath(raw) {
  if (!raw) return DEFAULT_FIXTURE;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function loadStudents(fixtureDir, studentsFile) {
  const path = join(fixtureDir, studentsFile);
  if (!existsSync(path)) {
    fail(`Students file not found: ${path}`);
  }
  const students = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(students) || students.length === 0) {
    fail(`Students file must be a non-empty array: ${path}`);
  }
  return students;
}

async function main() {
  for (const envPath of ENV_CANDIDATES) {
    loadEnvFile(envPath);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const password =
    args.password ?? process.env.SEED_BOOTSTRAP_PASSWORD ?? '';
  if (!password.trim()) {
    fail(
      'SEED_BOOTSTRAP_PASSWORD is required. Copy scripts/seed-fixtures/.env.seed.example → .env.seed.local (repo root or scripts/seed-fixtures/) and set a password.',
    );
  }

  const base =
    args.base ?? process.env.API_BASE ?? DEFAULT_BASE;
  const fixturePath = resolveFixturePath(args.fixture);
  if (!existsSync(fixturePath)) {
    fail(`Fixture not found: ${fixturePath}`);
  }

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const fixtureDir = dirname(fixturePath);
  const adminEmail = args.adminEmail ?? fixture.admin?.email;
  const adminName = fixture.admin?.name ?? 'Admin';
  if (!adminEmail) {
    fail('Fixture admin.email is required (or pass --admin-email).');
  }

  console.log(`Seeding against ${base} from ${fixturePath}`);

  // 1. bootstrap-admin
  {
    const step = 'bootstrap-admin';
    const { status, body } = await requestJson(base, 'POST', '/seed/bootstrap-admin', {
      body: { name: adminName, email: adminEmail, password },
      dryRun: args.dryRun,
      step,
    });
    if (args.dryRun) {
      // continue
    } else if (status === 201) {
      summarize(step, status, body);
    } else if (status === 409) {
      summarize(step, 'skipped', { reason: body?.code ?? 'BOOTSTRAP_NOT_AVAILABLE' });
    } else {
      fail(`${step} failed (${status}): ${JSON.stringify(body)}`);
    }
  }

  // 2. login
  let token;
  {
    const step = 'login';
    const { status, body } = await requestJson(base, 'POST', '/auth/login', {
      body: { email: adminEmail, password },
      dryRun: args.dryRun,
      step,
    });
    if (args.dryRun) {
      token = 'dry-run-token';
    } else if (status === 200 && body.accessToken) {
      token = body.accessToken;
      summarize(step, status, { email: adminEmail });
    } else if (status === 401) {
      fail(
        `${step}: 401 — password in env may not match existing admin. Re-run with --update-passwords after fixing bootstrap, or reset the account.`,
      );
    } else {
      fail(`${step} failed (${status}): ${JSON.stringify(body)}`);
    }
  }

  // 3. accounts
  for (const account of fixture.accounts ?? []) {
    const step = `account:${account.email}`;
    const body = {
      name: account.name,
      email: account.email,
      role: account.role,
      password,
      ...(args.updatePasswords ? { updatePassword: true } : {}),
    };
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/accounts',
      { token, body, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  // 4. semesters
  for (const semester of fixture.semesters ?? []) {
    const step = `semester:${semester.name}`;
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/semesters',
      { token, body: semester, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  // 5. rooms
  for (const room of fixture.rooms ?? []) {
    const step = `room:${room.name}`;
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/rooms',
      { token, body: room, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  // 6. courses
  for (const course of fixture.courses ?? []) {
    const step = `course:${course.code}`;
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/courses',
      { token, body: course, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  // 7. classes
  for (const klass of fixture.classes ?? []) {
    const step = `class:${klass.courseCode}/${klass.name}`;
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/classes',
      { token, body: klass, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  // 8. rosters
  for (const roster of fixture.rosters ?? []) {
    const students = loadStudents(fixtureDir, roster.studentsFile);
    const step = `roster:${roster.courseCode}/${roster.className}`;
    const body = {
      courseCode: roster.courseCode,
      semesterName: roster.semesterName,
      className: roster.className,
      students,
      ...(roster.removeMissing !== undefined
        ? { removeMissing: roster.removeMissing }
        : {}),
    };
    const { status, body: res } = await requestJson(
      base,
      'POST',
      '/admin/seed/classes/roster',
      { token, body, dryRun: args.dryRun, step },
    );
    if (!args.dryRun && status !== 200 && status !== 201) {
      fail(`${step} failed (${status}): ${JSON.stringify(res)}`);
    }
    summarize(step, args.dryRun ? 'dry-run' : status, res);
  }

  console.log(args.dryRun ? 'Dry run complete.' : 'Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
