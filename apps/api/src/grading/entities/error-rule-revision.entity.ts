import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RulePredicate } from '../decision/types';

/**
 * Một bản sửa của một luật (§14.1). Chỉ thêm (`trg_error_rule_revision_append_only`) — không
 * extends `BaseEntity`: không có `updated_at`. `import type` không sinh `require` lúc chạy, nên
 * không phá luật LEAF của decorator.
 */
@Entity({ name: 'error_rule_revision' })
export class ErrorRuleRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ type: 'int' })
  revision!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  /** Một trong bốn mẫu điều kiện của §4.1; null = luật bằng lời. */
  @Column({ type: 'jsonb', nullable: true })
  predicate!: RulePredicate | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;
}
