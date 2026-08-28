import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EnrollmentStatus = 'active' | 'dropped' | 'withdrawn';

@Entity({ name: 'course_section_enrollments' })
export class CourseSectionEnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;

  @Column({
    type: 'enum',
    enum: ['active', 'dropped', 'withdrawn'],
    enumName: 'enrollment_status',
    default: 'active',
  })
  status!: EnrollmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
