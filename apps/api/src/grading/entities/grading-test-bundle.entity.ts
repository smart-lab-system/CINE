import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TEST_BUNDLE_ORIGINS, TestBundleOrigin } from '../grading-model.types';

/**
 * Một PHIÊN BẢN gói test của một phiên (§14.1). Chỉ việc duyệt ghi lên dòng được, một lần
 * (`trg_grading_test_bundle_approve_once`); bỏ ca = phiên bản mới. Ca nằm ở `grading_test_case`.
 */
@Entity({ name: 'grading_test_bundle' })
export class GradingTestBundleEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'enum', enum: TEST_BUNDLE_ORIGINS, enumName: 'test_bundle_origin' })
  origin!: TestBundleOrigin;

  /** File giảng viên tải lên, nếu gói đến từ một file. Gói sinh ra không có. */
  @Column({ name: 'storage_key', type: 'varchar', length: 512, nullable: true })
  storageKey!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename!: string | null;

  /** `{kind:'exact'} | {kind:'unordered_lines'} | {kind:'float_tolerance',eps} | {kind:'checker',name}` (§14.1). */
  @Column({ type: 'jsonb', nullable: true })
  comparator!: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;
}
