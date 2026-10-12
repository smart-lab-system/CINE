import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog master data độc lập — spec 2026-10-07.
 * Không gắn FK sang exam_session / class / enrollment / rubric.
 */
export class AddMasterDataEntities1789500000000 implements MigrationInterface {
  name = 'AddMasterDataEntities1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "examcollect"."academic_year_status" AS ENUM ('planned', 'active', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."semester_status" AS ENUM ('planned', 'active', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."course_status" AS ENUM ('active', 'inactive')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."nominal_class_status" AS ENUM ('active', 'inactive')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."student_status" AS ENUM ('active', 'inactive', 'graduated', 'withdrawn')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."room_status" AS ENUM ('available', 'maintenance', 'retired')
    `);
    await queryRunner.query(`
      CREATE TYPE "examcollect"."computer_status" AS ENUM ('available', 'maintenance', 'retired')
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."academic_year" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" character varying(20) NOT NULL,
        "name" character varying(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" "examcollect"."academic_year_status" NOT NULL,
        CONSTRAINT "PK_academic_year" PRIMARY KEY ("id"),
        CONSTRAINT "ck_academic_year_dates" CHECK ("end_date" > "start_date")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_academic_year_code"
        ON "examcollect"."academic_year" ("code")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."semester" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "academic_year_id" uuid NOT NULL,
        "code" character varying(20) NOT NULL,
        "name" character varying(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" "examcollect"."semester_status" NOT NULL,
        CONSTRAINT "PK_semester" PRIMARY KEY ("id"),
        CONSTRAINT "ck_semester_dates" CHECK ("end_date" > "start_date"),
        CONSTRAINT "fk_semester_academic_year"
          FOREIGN KEY ("academic_year_id")
          REFERENCES "examcollect"."academic_year"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_semester_year_code"
        ON "examcollect"."semester" ("academic_year_id", "code")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."course" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" character varying(50) NOT NULL,
        "name" character varying(200) NOT NULL,
        "status" "examcollect"."course_status" NOT NULL,
        CONSTRAINT "PK_course" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_course_code"
        ON "examcollect"."course" ("code")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."nominal_class" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" character varying(50) NOT NULL,
        "name" character varying(150),
        "cohort_year" integer,
        "status" "examcollect"."nominal_class_status" NOT NULL,
        CONSTRAINT "PK_nominal_class" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_nominal_class_code"
        ON "examcollect"."nominal_class" ("code")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."student" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "mssv" citext NOT NULL,
        "full_name" character varying(150) NOT NULL,
        "nominal_class_id" uuid NOT NULL,
        "status" "examcollect"."student_status" NOT NULL,
        CONSTRAINT "PK_student" PRIMARY KEY ("id"),
        CONSTRAINT "ck_student_mssv" CHECK (mssv ~ '^[A-Za-z0-9]{4,20}$'),
        CONSTRAINT "fk_student_nominal_class"
          FOREIGN KEY ("nominal_class_id")
          REFERENCES "examcollect"."nominal_class"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_student_mssv"
        ON "examcollect"."student" ("mssv")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."room" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "code" character varying(50) NOT NULL,
        "name" character varying(150) NOT NULL,
        "capacity" integer NOT NULL,
        "building" character varying(100),
        "status" "examcollect"."room_status" NOT NULL,
        CONSTRAINT "PK_room" PRIMARY KEY ("id"),
        CONSTRAINT "ck_room_capacity" CHECK ("capacity" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_room_code"
        ON "examcollect"."room" ("code")
    `);

    await queryRunner.query(`
      CREATE TABLE "examcollect"."computer" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "room_id" uuid NOT NULL,
        "hostname" character varying(100) NOT NULL,
        "cpu" character varying(200) NOT NULL,
        "ram_gb" integer NOT NULL,
        "storage" character varying(200) NOT NULL,
        "gpu" character varying(200),
        "os" character varying(100) NOT NULL,
        "ip_address" character varying(45),
        "mac_address" character varying(17),
        "status" "examcollect"."computer_status" NOT NULL,
        CONSTRAINT "PK_computer" PRIMARY KEY ("id"),
        CONSTRAINT "ck_computer_ram_gb" CHECK ("ram_gb" > 0),
        CONSTRAINT "fk_computer_room"
          FOREIGN KEY ("room_id")
          REFERENCES "examcollect"."room"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_computer_room_hostname"
        ON "examcollect"."computer" ("room_id", "hostname")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."computer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."room"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."student"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."nominal_class"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."course"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."semester"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "examcollect"."academic_year"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."computer_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."room_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."student_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."nominal_class_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."course_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."semester_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "examcollect"."academic_year_status"`);
  }
}
