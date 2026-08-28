import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PROCTOR_ROLES = ['lead', 'assistant'] as const;

export type ProctorRole = (typeof PROCTOR_ROLES)[number];

@Entity({ name: 'session_proctors' })
export class SessionProctorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'lecturer_id', type: 'uuid' })
  lecturerId!: string;

  @Column({
    type: 'enum',
    enum: PROCTOR_ROLES,
    enumName: 'proctor_role',
    default: 'assistant',
  })
  role!: ProctorRole;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
