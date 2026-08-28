import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'course_sections' })
export class CourseSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @Column({ name: 'academic_term_id', type: 'uuid' })
  academicTermId!: string;

  @Column({ name: 'section_code', type: 'citext' })
  sectionCode!: string;

  @Column({
    name: 'nominal_class_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  nominalClassCode!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null;

  @Column({ name: 'lecturer_id', type: 'uuid', nullable: true })
  lecturerId!: string | null;

  @Column({ name: 'max_enrollment', type: 'smallint', nullable: true })
  maxEnrollment!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
