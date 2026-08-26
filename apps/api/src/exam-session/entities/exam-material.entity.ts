import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ExamSessionEntity } from './exam-session.entity';

// Metadata only; the actual file lives in object storage (S3/MinIO) via a
// presigned URL — never written to the NestJS server's disk. Materials
// must only be released to the agent once the server confirms start_time
// has passed, even if the agent connected earlier (CLAUDE.md Security
// rule 2) — that gate is an application-layer check on read, not
// something a table constraint can express.
@Entity({ name: 'exam_material' })
@Check('ck_exam_material_file_size', 'file_size >= 0')
export class ExamMaterialEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;
}
