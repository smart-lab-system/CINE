import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type CostBudgetScope = 'teacher' | 'department';

// `scopeId` is intentionally a plain column, not a foreign key: it points
// at account.id when scopeType = 'teacher' (an app-layer join, not a DB
// constraint — Postgres has no conditional FK), but there is no
// department table to point at when scopeType = 'department' (tiered
// admin is out of scope for the MVP, see RubricTemplateEntity).
@Entity({ name: 'cost_budget' })
@Index('uq_cost_budget_scope_period', ['scopeType', 'scopeId', 'period'], {
  unique: true,
})
@Check('ck_cost_budget_limit', 'monthly_limit_usd >= 0')
@Check('ck_cost_budget_spend', 'current_spend_usd >= 0')
@Check('ck_cost_budget_period', "period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'")
export class CostBudgetEntity extends BaseEntity {
  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: ['teacher', 'department'],
    enumName: 'cost_budget_scope',
  })
  scopeType!: CostBudgetScope;

  @Column({ name: 'scope_id', type: 'uuid' })
  scopeId!: string;

  @Column({ name: 'monthly_limit_usd', type: 'numeric', precision: 10, scale: 2 })
  monthlyLimitUsd!: string;

  @Column({
    name: 'current_spend_usd',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  currentSpendUsd!: string;

  // 'YYYY-MM' — one budget row per scope per calendar month.
  @Column({ type: 'varchar', length: 7 })
  period!: string;
}
