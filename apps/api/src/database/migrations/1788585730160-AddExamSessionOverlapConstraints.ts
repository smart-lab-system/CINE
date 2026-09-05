import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two exams cannot share a room, and one class cannot sit two exams at
 * once. Nothing enforced either before this: a lecturer could book an
 * occupied lab and only find out on exam day.
 *
 * EXCLUDE rather than a service-level check, because a check that runs
 * before an INSERT cannot see a row another request is inserting at the
 * same moment. `ExamSessionService` still pre-checks — that is what
 * produces a message naming the room and the clash — but the rule itself
 * is a property of the table, so it also holds for concurrent writes and
 * for write paths that do not exist yet (a reschedule endpoint, a seed
 * script, a psql session).
 *
 * `btree_gist` is what lets a gist index mix an equality column (room_id,
 * class_id — uuid) with the overlap operator on a range. Core gist handles
 * the range half; the extension supplies the btree half.
 *
 * Three decisions encoded here, all deliberate:
 *
 * - `'[)'` — half-open. An exam from 10:00 is not in conflict with one
 *   ending at 10:00; back-to-back exams in one lab are normal scheduling.
 *
 * - `WHERE status <> 'completed' AND status <> 'cancelled'` — a finished
 *   exam stops holding its room immediately, so a session that ends early
 *   frees the lab for the rest of its declared window. Rooms are scarce;
 *   holding one against an exam that is over would be worse than the
 *   double-booking this migration prevents. Written as exclusions rather
 *   than as a positive `status IN (...)` list on purpose: if a status is
 *   added later and nobody updates this predicate, the negative form
 *   errs toward refusing a booking, the positive form toward allowing a
 *   double-booking. The cheaper mistake is the one that refuses.
 *
 * - `class_id` is nullable, and a NULL never satisfies `WITH =`, so a
 *   session not tied to a class holds no class slot. That is the intent,
 *   not an oversight.
 */
export class AddExamSessionOverlapConstraints1788585730160 implements MigrationInterface {
    name = 'AddExamSessionOverlapConstraints1788585730160'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "ex_exam_session_room_overlap" EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'completed' AND "status" <> 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "ex_exam_session_class_overlap" EXCLUDE USING gist ("class_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'completed' AND "status" <> 'cancelled')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_class_overlap"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`);
        // btree_gist is left installed: dropping an extension another
        // migration may come to depend on is not this migration's business
        // to undo, and an unused extension costs nothing.
    }

}
