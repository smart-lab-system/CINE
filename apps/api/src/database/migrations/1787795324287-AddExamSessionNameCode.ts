import { MigrationInterface, QueryRunner } from "typeorm";

// Hand-fixed after `migration:generate`: the generator also emitted
// DROP/ADD of "PK_audit_log" (narrowing it from (occurred_at, id) back to
// (id)) plus a matching drop/recreate of the three audit_log indexes. That
// is stale drift from audit_log's RANGE partitioning being hand-fixed in
// InitialSchema (see the comment there) — TypeORM's schema diff can't see
// partitioning, so every regenerate proposes "undoing" it. Narrowing the PK
// on a partitioned table is also rejected by Postgres outright (a unique
// constraint on a partitioned table must include all partition-key
// columns), so it's not just unrelated, it would have failed migration:run.
// Removed here; this migration only touches exam_session.
export class AddExamSessionNameCode1787795324287 implements MigrationInterface {
    name = 'AddExamSessionNameCode1787795324287'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "name" character varying(200) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD "code" character varying(20) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_100641d6d10a21a54cc580117ed"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "course_id" DROP NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_exam_session_code" ON "examcollect"."exam_session" ("code") `);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_100641d6d10a21a54cc580117ed" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "FK_100641d6d10a21a54cc580117ed"`);
        await queryRunner.query(`DROP INDEX "examcollect"."uq_exam_session_code"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "course_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "FK_100641d6d10a21a54cc580117ed" FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "code"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "name"`);
    }

}
