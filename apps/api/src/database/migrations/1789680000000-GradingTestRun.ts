import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G2b-R: bảng `grading_test_run` — mỗi lượt chạy đáp án mẫu của giảng viên trên một gói test (chạy thử), và về sau mỗi
 * lượt sinh gói (spec §4.2). CHỈ THÊM bảng mới.
 *
 * - Dòng `running` được INSERT TRƯỚC khi gọi sandbox; đúng một lần UPDATE được phép, từ `running` sang trạng thái kết
 *   thúc (cùng kiểu `guard_test_bundle_approve_once`). Không có DELETE (`guard_no_delete`): một lượt đã ghi là chứng cứ.
 * - Unique index từng phần: mỗi phiên tối đa MỘT dòng `running`, nên bấm hai lần luôn có đúng một bên thắng, kể cả khi
 *   hai request đến cùng lúc. Dòng `running` quá 15 phút bị service đánh dấu `aborted` trước khi INSERT (đã chết).
 * - KHÔNG lưu stdout; `cases[].diff` do service cắt còn 200 ký tự.
 */
export class GradingTestRun1789680000000 implements MigrationInterface {
  name = 'GradingTestRun1789680000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."grading_test_run" (
        "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT,
        "problem_id"      uuid REFERENCES "examcollect"."exam_problem"("id") ON DELETE RESTRICT,
        "test_bundle_id"  uuid REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT,
        "kind"            varchar(20) NOT NULL,
        "case_key"        text,
        "source_sha256"   varchar(64),
        "requested_by"    uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "requested_at"    timestamptz NOT NULL DEFAULT now(),
        "finished_at"     timestamptz,
        "status"          varchar(20) NOT NULL,
        "host"            jsonb,
        "cases"           jsonb,
        CONSTRAINT "ck_grading_test_run_kind" CHECK ("kind" IN ('generate_statement', 'generate_answer', 'test_run')),
        CONSTRAINT "ck_grading_test_run_status" CHECK ("status" IN
          ('running', 'pass', 'fail', 'compile_error', 'unavailable', 'aborted', 'dropped_all')),
        CONSTRAINT "ck_grading_test_run_finished" CHECK (("status" = 'running') = ("finished_at" IS NULL))
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_grading_test_run_one_running" ON "examcollect"."grading_test_run" ("exam_session_id") WHERE "status" = 'running'`);
    await q.query(`CREATE INDEX "ix_grading_test_run_session" ON "examcollect"."grading_test_run" ("exam_session_id", "requested_at")`);
    await q.query(`
      CREATE FUNCTION examcollect.guard_test_run_finish_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF OLD.status <> 'running' OR NEW.status = 'running'
           OR (to_jsonb(NEW) - 'status' - 'finished_at' - 'host' - 'cases' - 'test_bundle_id' - 'source_sha256' - 'updated_at')
              IS DISTINCT FROM
              (to_jsonb(OLD) - 'status' - 'finished_at' - 'host' - 'cases' - 'test_bundle_id' - 'source_sha256' - 'updated_at') THEN
          RAISE EXCEPTION 'Lượt chạy % chỉ ghi được việc kết thúc, và chỉ một lần', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_grading_test_run_finish_once" BEFORE UPDATE ON "examcollect"."grading_test_run" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_test_run_finish_once()`);
    await q.query(`CREATE TRIGGER "set_updated_at_grading_test_run" BEFORE UPDATE ON "examcollect"."grading_test_run" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_grading_test_run_no_delete" BEFORE DELETE ON "examcollect"."grading_test_run" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS "trg_grading_test_run_no_delete" ON "examcollect"."grading_test_run"`);
    await q.query(`DROP TRIGGER IF EXISTS "set_updated_at_grading_test_run" ON "examcollect"."grading_test_run"`);
    await q.query(`DROP TRIGGER IF EXISTS "trg_grading_test_run_finish_once" ON "examcollect"."grading_test_run"`);
    await q.query(`DROP FUNCTION IF EXISTS examcollect.guard_test_run_finish_once()`);
    await q.query(`DROP TABLE IF EXISTS "examcollect"."grading_test_run"`);
  }
}
