import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { CourseEntity } from '../../master-data/entities/course.entity';

export type IdeExtensionPolicyScope = 'global' | 'course';

@Entity({ name: 'ide_extension_policy' })
@Check(
  'ck_ide_extension_policy_scope',
  `(scope_type = 'global' AND course_id IS NULL) OR (scope_type = 'course' AND course_id IS NOT NULL)`,
)
export class IdeExtensionPolicyEntity extends BaseEntity {
  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: ['global', 'course'],
    enumName: 'ide_extension_policy_scope',
  })
  scopeType!: IdeExtensionPolicyScope;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
