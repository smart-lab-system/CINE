import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đề xuất phòng máy từ Teacher Hub — spec §7.4.
 */
export class LabRoomProposal1789650000000 implements MigrationInterface {
  name = 'LabRoomProposal1789650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."lab_room_proposal_status" AS ENUM (
        'pending', 'accepted', 'rejected', 'withdrawn'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."lab_room_proposal" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status" "examcollect"."lab_room_proposal_status" NOT NULL DEFAULT 'pending',
        "code" character varying(50) NOT NULL,
        "name" character varying(150) NOT NULL,
        "capacity" integer NOT NULL,
        "building" character varying(100),
        "floor" character varying(50),
        "proposed_by_account_id" uuid NOT NULL,
        "proposed_by_email" character varying(255) NOT NULL,
        "proposed_by_display_name" character varying(200),
        "lab_mgmt_session_id" uuid,
        "machine_count" integer NOT NULL,
        "note" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "created_room_id" uuid,
        CONSTRAINT "PK_lab_room_proposal" PRIMARY KEY ("id"),
        CONSTRAINT "ck_lab_room_proposal_capacity" CHECK ("capacity" > 0),
        CONSTRAINT "fk_lab_room_proposal_proposed_by"
          FOREIGN KEY ("proposed_by_account_id") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_lab_room_proposal_reviewed_by"
          FOREIGN KEY ("reviewed_by") REFERENCES "examcollect"."account"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_lab_room_proposal_created_room"
          FOREIGN KEY ("created_room_id") REFERENCES "examcollect"."room"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_lab_room_proposal_status"
        ON "examcollect"."lab_room_proposal" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."lab_room_proposal_machine" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "proposal_id" uuid NOT NULL,
        "machine_id" character varying(100) NOT NULL,
        "hostname" character varying(200) NOT NULL,
        "local_ip" character varying(64),
        "os" character varying(100),
        "student_mssv" citext,
        "student_full_name" character varying(200),
        "role" character varying(32) NOT NULL,
        "last_seen_at" TIMESTAMP WITH TIME ZONE,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_lab_room_proposal_machine" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lab_room_proposal_machine_proposal"
          FOREIGN KEY ("proposal_id") REFERENCES "examcollect"."lab_room_proposal"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."lab_room_proposal_machine"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."lab_room_proposal"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."lab_room_proposal_status"`);
  }
}
