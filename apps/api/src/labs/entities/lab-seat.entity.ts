import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'lab_seats' })
export class LabSeatEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'layout_id', type: 'uuid' })
  layoutId!: string;

  @Column({ name: 'lab_id', type: 'uuid' })
  labId!: string;

  @Column({ name: 'workstation_id', type: 'uuid', nullable: true })
  workstationId!: string | null;

  @Column({ name: 'seat_code', type: 'citext' })
  seatCode!: string;

  @Column({ name: 'row_no', type: 'smallint', nullable: true })
  rowNo!: number | null;

  @Column({ name: 'column_no', type: 'smallint', nullable: true })
  columnNo!: number | null;

  @Column({ name: 'position_x', type: 'numeric', precision: 10, scale: 2 })
  positionX!: string;

  @Column({ name: 'position_y', type: 'numeric', precision: 10, scale: 2 })
  positionY!: string;

  @Column({
    name: 'rotation_degrees',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  rotationDegrees!: string;

  @Column({
    name: 'shape',
    type: 'enum',
    enum: ['rect', 'circle', 'diamond'],
    enumName: 'seat_shape',
    default: 'rect',
  })
  shape!: 'rect' | 'circle' | 'diamond';

  @Column({ name: 'is_disabled', type: 'boolean', default: false })
  isDisabled!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
