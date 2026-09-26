/**
 * Dựng lại `guard_grading_result_ai_immutable` từ danh sách cột ĐỘNG — khuôn của
 * `AddAdvocateOutcome1789310000000`, chép sang đây vì migration đã chạy thì không được sửa.
 * Hàm chỉ giữ những cột ĐANG có trong bảng, nên gọi được ở mọi trạng thái schema; migration nào
 * từ nay đụng tới guard thì gọi hàm này, KHÔNG viết cứng danh sách.
 *
 * Thư mục `support/` nằm ngoài glob `migrations/*.{js,ts}` của data source: TypeORM không coi
 * file này là một migration.
 */
export const AI_OUTPUT_COLUMNS = [
  'ai_total_score',
  'criterion_results',
  'model_used',
  'confidence',
  'advocate_opinion',
  'advocate_outcome',
  'context_used_question',
  'context_used_model_answer',
] as const;

export function rebuildAiImmutableGuardSql(columns: readonly string[]): string {
  const list = columns.map((c) => `'${c}'`).join(', ');
  return `
    DO $do$
    DECLARE
      superset text[] := ARRAY[${list}];
      present  text[];
      predicate text;
    BEGIN
      SELECT array_agg(t.c ORDER BY t.ord)
        INTO present
        FROM unnest(superset) WITH ORDINALITY AS t(c, ord)
       WHERE EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'examcollect' AND table_name = 'grading_result' AND column_name = t.c
       );

      SELECT string_agg(format('NEW.%I IS DISTINCT FROM OLD.%I', c, c), E'\\n OR ')
        INTO predicate
        FROM unnest(present) c;

      EXECUTE
        $f$
        CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path TO 'examcollect', 'public'
        AS $body$
            BEGIN
                IF OLD.ai_total_score IS NOT NULL
                   AND (
        $f$
        || predicate ||
        $f$
                   ) THEN
                    RAISE EXCEPTION
                        'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                        OLD.id
                        USING ERRCODE = 'object_not_in_prerequisite_state';
                END IF;
                RETURN NEW;
            END;
        $body$
        $f$;
    END
    $do$;
  `;
}
