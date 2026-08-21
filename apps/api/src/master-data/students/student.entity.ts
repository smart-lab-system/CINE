import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'students' })
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_code', type: 'citext' })
  studentCode!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'class_code', type: 'varchar', length: 50, nullable: true })
  classCode!: string | null;

  @Column({ name: 'cohort_year', type: 'smallint', nullable: true })
  cohortYear!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
