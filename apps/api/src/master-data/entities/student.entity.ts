import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { NominalClassEntity } from './nominal-class.entity';

export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'withdrawn';

@Entity({ name: 'student' })
@Check('ck_student_mssv', "mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class StudentEntity extends BaseEntity {
  @Index('uq_student_mssv', { unique: true })
  @Column({ type: 'citext' })
  mssv!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Column({ name: 'nominal_class_id', type: 'uuid' })
  nominalClassId!: string;

  @ManyToOne(() => NominalClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'nominal_class_id' })
  nominalClass!: NominalClassEntity;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'graduated', 'withdrawn'],
    enumName: 'student_status',
  })
  status!: StudentStatus;
}
