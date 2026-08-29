import 'dotenv/config';
import { Client } from 'pg';

const EXPECTED_TABLES = [
  'account',
  'semester',
  'course',
  'class',
  'enrollment',
  'room',
  'rubric',
  'rubric_criterion',
  'exam_session',
  'required_deliverable',
  'exam_material',
  'agent_connection_event',
  'submission',
  'grading_result',
  'teacher_review',
  'grade_export',
  'calibration_run',
  'audit_log',
  'rubric_template',
  'cost_budget',
  'grading_pipeline_config',
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'examcollect'`,
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));

  await client.end();

  if (missing.length > 0) {
    console.error('Missing tables in examcollect schema:', missing);
    process.exit(1);
  }

  console.log(`All ${EXPECTED_TABLES.length} expected tables are present.`);
  process.exit(0);
}

main();
