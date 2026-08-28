import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const EXAM_FILE_ROLES = [
  'question',
  'attachment',
  'answer_template',
  'guide',
] as const;

export type ExamFileRole = (typeof EXAM_FILE_ROLES)[number];

@Entity({ name: 'exam_event_files' })
export class ExamEventFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'exam_event_id', type: 'uuid' })
  examEventId!: string;

  @Column({ name: 'stored_object_id', type: 'uuid' })
  storedObjectId!: string;

  @Column({
    name: 'file_role',
    type: 'enum',
    enum: EXAM_FILE_ROLES,
    enumName: 'exam_file_role',
  })
  fileRole!: ExamFileRole;

  @Column({ type: 'varchar', length: 250, nullable: true })
  title!: string | null;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
