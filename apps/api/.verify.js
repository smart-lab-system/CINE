require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => {
    const r = await c.query(sql); console.log(`--- ${label} ---`); console.log(JSON.stringify(r.rows));
  };
  await q('last 8 migrations', `select name from examcollect.migrations order by id desc limit 8`);
  await q('dropped tables gone?', `select tablename from pg_tables where schemaname='examcollect' and tablename in ('course','room','semester')`);
  await q('table count', `select count(*) n from pg_tables where schemaname='examcollect'`);
  await q('account_role enum', `select string_agg(e.enumlabel,',' order by e.enumsortorder) l from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='examcollect' and t.typname='account_role'`);
  await q('roles in use', `select role, count(*) n from examcollect.account group by 1 order by 1`);
  await q('class', `select id, name, course_name, teacher_id from examcollect.class`);
  await q('exam_session text cols', `select name, course_name, room_name, class_id is not null has_class from examcollect.exam_session`);
  await q('rubric owners', `select id, name, version, teacher_id from examcollect.rubric order by name, version`);
  await q('exam_session constraints', `select conname from pg_constraint where conrelid='examcollect.exam_session'::regclass and conname like 'ex_%' order by 1`);
  await q('new indexes', `select indexname from pg_indexes where schemaname='examcollect' and indexname in ('uq_enrollment_class_student','uq_rubric_teacher_name_version','uq_class_teacher_course_name') order by 1`);
  await q('old indexes gone', `select indexname from pg_indexes where schemaname='examcollect' and indexname in ('uq_enrollment_course_student','uq_rubric_course_version','uq_class_course_name')`);
  await q('teacher_busy_range fn', `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='examcollect' and proname='teacher_busy_range'`);
  await q('row counts kept', `select 'account' t,count(*) n from examcollect.account union all select 'enrollment',count(*) from examcollect.enrollment union all select 'submission',count(*) from examcollect.submission union all select 'grading_result',count(*) from examcollect.grading_result union all select 'teacher_review',count(*) from examcollect.teacher_review order by 1`);
  await q('advocate_outcome col', `select column_name from information_schema.columns where table_schema='examcollect' and table_name='grading_result' and column_name in ('advocate_outcome','ungradable_reason') order by 1`);
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
