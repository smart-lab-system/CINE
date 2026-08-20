import 'dotenv/config';
import { Client } from 'pg';

const EXPECTED_TABLES = [
  'roles',
  'users',
  'user_roles',
  'students',
  'lecturers',
  'subjects',
  'academic_terms',
  'course_sections',
  'labs',
  'workstations',
  'lab_layouts',
  'lab_seats',
  'exam_events',
  'lab_sessions',
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'lab_management'`,
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));

  await client.end();

  if (missing.length > 0) {
    console.error('Missing tables in lab_management schema:', missing);
    process.exit(1);
  }

  console.log(`All ${EXPECTED_TABLES.length} expected tables are present.`);
  process.exit(0);
}

main();
