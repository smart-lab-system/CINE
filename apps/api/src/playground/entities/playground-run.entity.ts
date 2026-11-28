import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { PLAYGROUND_LANGUAGES } from '../playground.constants';
import type { EntryDetection, PlaygroundLanguage } from '../entry-scanner';

export const PLAYGROUND_RUN_STATUSES = [
  'created',
  'needs_entry',
  'queued',
  'running',
  'finished',
  'failed',
] as const;

export type PlaygroundRunStatus = (typeof PLAYGROUND_RUN_STATUSES)[number];

@Entity({ name: 'playground_run' })
export class PlaygroundRunEntity extends BaseEntity {
  @Index()
  @Column({ name: 'created_by_account_id', type: 'uuid' })
  createdByAccountId!: string;

  @Column({ type: 'varchar', length: 16 })
  language!: PlaygroundLanguage;

  @Column({ type: 'varchar', length: 32 })
  status!: PlaygroundRunStatus;

  @Column({ name: 'entry_path', type: 'varchar', length: 512, nullable: true })
  entryPath!: string | null;

  @Column({ name: 'entry_detection', type: 'varchar', length: 16, nullable: true })
  entryDetection!: EntryDetection | 'manual' | null;

  @Column({ type: 'jsonb', nullable: true })
  candidates!: string[] | null;

  /** Danh sách path relative trong workspace. */
  @Column({ name: 'file_paths', type: 'jsonb' })
  filePaths!: string[];

  @Column({ name: 'compile_log', type: 'text', nullable: true })
  compileLog!: string | null;

  @Column({ type: 'text', nullable: true })
  stdout!: string | null;

  @Column({ type: 'text', nullable: true })
  stderr!: string | null;

  @Column({ name: 'exit_code', type: 'int', nullable: true })
  exitCode!: number | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  /** URL nginx preview (web tĩnh). */
  @Column({ name: 'preview_url', type: 'varchar', length: 1024, nullable: true })
  previewUrl!: string | null;

  /** Slug công khai `/pg/{slug}/` (từ bài chấm: mssv-hovaten). Unique qua migration. */
  @Column({ name: 'preview_slug', type: 'varchar', length: 160, nullable: true })
  previewSlug!: string | null;

  @Column({ name: 'container_name', type: 'varchar', length: 128, nullable: true })
  containerName!: string | null;

  @Column({ name: 'host_port', type: 'int', nullable: true })
  hostPort!: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
}

export type { PlaygroundLanguage };
export { PLAYGROUND_LANGUAGES };
