import 'dotenv/config';
import { Client } from 'pg';

const EXPECTED_TABLES = [
  'account',
  'class',
  'enrollment',
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
  'ai_usage',
  'calibration_run',
  'audit_log',
  'rubric_template',
  'cost_budget',
  'grading_pipeline_config',
  // Mô hình dữ liệu §14 của spec chấm bằng agent điều tra (bước 3b).
  'error_rule',
  'error_rule_revision',
  'price_table_version',
  'rule_price',
  'rubric_error',
  'rubric_error_price',
  'error_rule_sighting',
  'grading_test_bundle',
  'grading_test_case',
  'grading_attempt',
  'score_computation',
  'criterion_waiver',
  'audit_sample_review',
  // Catalog master data (spec 2026-10-07) — độc lập schema nghiệp vụ cũ.
  'academic_year',
  'semester',
  'course',
  'nominal_class',
  'student',
  'room',
  'computer',
  'grade_export_row',
  // Chấm điểm duyệt nhanh P1 (spec 2026-10-21 §5.3): nhãn kiểm mẫu và cầu dao tự chốt.
  'audit_rule_label',
  'audit_no_error_label',
  'auto_rule_breaker',
];

/**
 * Những thứ Chấm điểm duyệt nhanh P1 thêm vào schema ngoài bảng (spec 2026-10-21 §5.3–§5.5):
 * cột, giá trị enum, khoá ngoại, chỉ mục từng phần, trigger chỉ-thêm và view. Mỗi mục là một câu
 * hỏi tới catalog của Postgres cùng điều kiện "đạt" trên các dòng trả về; `sql` chỉ đọc.
 */
interface SchemaCheck {
  readonly name: string;
  readonly sql: string;
  readonly ok: (rows: Record<string, unknown>[]) => boolean;
}

const hasRows = (rows: Record<string, unknown>[]): boolean => rows.length > 0;

function columnCheck(table: string, column: string, dataType: string): SchemaCheck {
  return {
    name: `column examcollect.${table}.${column} (${dataType}, nullable)`,
    sql: `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'examcollect' AND table_name = '${table}' AND column_name = '${column}'
             AND data_type = '${dataType}' AND is_nullable = 'YES'`,
    ok: hasRows,
  };
}

function enumValueCheck(type: string, value: string): SchemaCheck {
  return {
    name: `enum value examcollect.${type} = '${value}'`,
    sql: `SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'examcollect' AND t.typname = '${type}' AND e.enumlabel = '${value}'`,
    ok: hasRows,
  };
}

function foreignKeyCheck(table: string, column: string, referencedTable: string): SchemaCheck {
  return {
    name: `foreign key examcollect.${table}.${column} -> examcollect.${referencedTable}`,
    sql: `SELECT 1 FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
           WHERE c.contype = 'f'
             AND c.conrelid = 'examcollect.${table}'::regclass
             AND c.confrelid = 'examcollect.${referencedTable}'::regclass
             AND a.attname = '${column}'`,
    ok: hasRows,
  };
}

function triggerCheck(table: string, trigger: string): SchemaCheck {
  return {
    name: `trigger ${trigger} on examcollect.${table}`,
    sql: `SELECT 1 FROM pg_trigger
           WHERE tgrelid = 'examcollect.${table}'::regclass AND tgname = '${trigger}' AND NOT tgisinternal`,
    ok: hasRows,
  };
}

function checkConstraintCheck(table: string, constraint: string): SchemaCheck {
  return {
    name: `check constraint ${constraint} on examcollect.${table}`,
    sql: `SELECT 1 FROM pg_constraint
           WHERE conrelid = 'examcollect.${table}'::regclass AND conname = '${constraint}' AND contype = 'c'`,
    ok: hasRows,
  };
}

function functionCheck(name: string): SchemaCheck {
  return {
    name: `function examcollect.${name}()`,
    sql: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'examcollect' AND p.proname = '${name}'`,
    ok: hasRows,
  };
}

const REVIEW_LABEL_VIEW_COLUMNS = [
  'result_id',
  'pipeline',
  'status',
  'system_total',
  'decision_kind',
  'teacher_total',
  'opened_at',
  'reviewed_at',
  'review_seconds',
];

const SCHEMA_CHECKS: readonly SchemaCheck[] = [
  columnCheck('grading_result', 'opened_at', 'timestamp with time zone'),
  enumValueCheck('teacher_review_kind', 'system_confirm'),
  enumValueCheck('score_computation_reason', 'auto_rule_tripped'),
  columnCheck('teacher_review', 'confirmed_computation_id', 'uuid'),
  foreignKeyCheck('teacher_review', 'confirmed_computation_id', 'score_computation'),
  foreignKeyCheck('audit_rule_label', 'rule_id', 'error_rule'),
  foreignKeyCheck('auto_rule_breaker', 'rule_id', 'error_rule'),
  triggerCheck('audit_rule_label', 'trg_audit_rule_label_append_only'),
  triggerCheck('audit_no_error_label', 'trg_audit_no_error_label_append_only'),
  // Khoá an toàn của cầu dao (cùng khuôn criterion_waiver): bật lại phải có người ký, chỉ một lần, không xoá được.
  checkConstraintCheck('auto_rule_breaker', 'ck_auto_rule_breaker_reset_pair'),
  checkConstraintCheck('auto_rule_breaker', 'ck_auto_rule_breaker_reset_after_trip'),
  functionCheck('guard_auto_rule_breaker_reset_once'),
  triggerCheck('auto_rule_breaker', 'trg_auto_rule_breaker_reset_once'),
  triggerCheck('auto_rule_breaker', 'trg_auto_rule_breaker_no_delete'),
  {
    name: 'partial unique index examcollect.uq_auto_rule_breaker_open (WHERE reset_at IS NULL)',
    sql: `SELECT indexdef FROM pg_indexes
           WHERE schemaname = 'examcollect' AND tablename = 'auto_rule_breaker'
             AND indexname = 'uq_auto_rule_breaker_open'`,
    ok: (rows) =>
      rows.length === 1 &&
      /CREATE UNIQUE INDEX/.test(String(rows[0].indexdef)) &&
      /WHERE \(?\(?reset_at IS NULL\)?\)?/.test(String(rows[0].indexdef)),
  },
  {
    name: 'check ck_teacher_review_score_by_kind covers system_confirm',
    sql: `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
           WHERE conrelid = 'examcollect.teacher_review'::regclass AND conname = 'ck_teacher_review_score_by_kind'`,
    ok: (rows) => rows.length === 1 && /confirmed_computation_id/.test(String(rows[0].def)),
  },
  {
    name: `view examcollect.review_label_v (${REVIEW_LABEL_VIEW_COLUMNS.join(', ')})`,
    sql: `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'examcollect' AND table_name = 'review_label_v'
           ORDER BY ordinal_position`,
    ok: (rows) => JSON.stringify(rows.map((r) => r.column_name)) === JSON.stringify(REVIEW_LABEL_VIEW_COLUMNS),
  },
  {
    name: 'review_label_v is a view, not a table',
    sql: `SELECT 1 FROM information_schema.views WHERE table_schema = 'examcollect' AND table_name = 'review_label_v'`,
    ok: hasRows,
  },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'examcollect'`,
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));

  // A check whose query itself fails (for example `'examcollect.audit_rule_label'::regclass` on a
  // table that does not exist yet) is a failed check, not a crash.
  const failedChecks: string[] = [];
  for (const check of SCHEMA_CHECKS) {
    try {
      const result = await client.query<Record<string, unknown>>(check.sql);
      if (!check.ok(result.rows)) failedChecks.push(check.name);
    } catch {
      failedChecks.push(check.name);
    }
  }

  await client.end();

  if (missing.length > 0) {
    console.error('Missing tables in examcollect schema:', missing);
  }
  if (failedChecks.length > 0) {
    console.error('Missing columns / enum values / constraints / indexes / views in examcollect schema:', failedChecks);
  }
  if (missing.length > 0 || failedChecks.length > 0) {
    process.exit(1);
  }

  console.log(`All ${EXPECTED_TABLES.length} expected tables are present.`);
  console.log(`All ${SCHEMA_CHECKS.length} additional schema checks passed.`);
  process.exit(0);
}

main();
