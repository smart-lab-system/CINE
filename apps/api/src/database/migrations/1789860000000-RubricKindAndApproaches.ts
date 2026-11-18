import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QA vs QS rubric (spec 2026-11-18): additive.
 * - rubric.kind mặc định 'qa' → mọi rubric cũ giữ hành vi trừ điểm hiện tại.
 * - rubric_approach + rubric_criterion.approach_id chỉ dùng khi kind = 'qs'.
 */
export class RubricKindAndApproaches1789860000000 implements MigrationInterface {
  name = 'RubricKindAndApproaches1789860000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD COLUMN "kind" varchar(8) NOT NULL DEFAULT 'qa'
    `);
    await q.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD CONSTRAINT "ck_rubric_kind" CHECK ("kind" IN ('qa', 'qs'))
    `);

    await q.query(`
      CREATE TABLE "examcollect"."rubric_approach" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "rubric_id" uuid NOT NULL,
        "key" text NOT NULL,
        "name" text NOT NULL,
        "sort_order" smallint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rubric_approach" PRIMARY KEY ("id"),
        CONSTRAINT "fk_rubric_approach_rubric" FOREIGN KEY ("rubric_id")
          REFERENCES "examcollect"."rubric"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_rubric_approach_key" CHECK ("key" ~ '^[a-z0-9_]{1,64}$'),
        CONSTRAINT "uq_rubric_approach_key" UNIQUE ("rubric_id", "key")
      )
    `);
    await q.query(
      `CREATE INDEX "idx_rubric_approach_rubric" ON "examcollect"."rubric_approach" ("rubric_id")`,
    );

    await q.query(`
      ALTER TABLE "examcollect"."rubric_criterion"
        ADD COLUMN "approach_id" uuid
    `);
    await q.query(`
      ALTER TABLE "examcollect"."rubric_criterion"
        ADD CONSTRAINT "fk_rubric_criterion_approach" FOREIGN KEY ("approach_id")
          REFERENCES "examcollect"."rubric_approach"("id") ON DELETE CASCADE
    `);
    await q.query(`
      CREATE INDEX "idx_rubric_criterion_approach"
        ON "examcollect"."rubric_criterion" ("approach_id")
        WHERE "approach_id" IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "examcollect"."idx_rubric_criterion_approach"`);
    await q.query(
      `ALTER TABLE "examcollect"."rubric_criterion" DROP CONSTRAINT IF EXISTS "fk_rubric_criterion_approach"`,
    );
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP COLUMN IF EXISTS "approach_id"`);
    await q.query(`DROP TABLE IF EXISTS "examcollect"."rubric_approach"`);
    await q.query(`ALTER TABLE "examcollect"."rubric" DROP CONSTRAINT IF EXISTS "ck_rubric_kind"`);
    await q.query(`ALTER TABLE "examcollect"."rubric" DROP COLUMN IF EXISTS "kind"`);
  }
}
