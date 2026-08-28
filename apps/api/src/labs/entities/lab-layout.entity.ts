import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'lab_layouts' })
export class LabLayoutEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lab_id', type: 'uuid' })
  labId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'version_no', type: 'int', default: 1 })
  versionNo!: number;

  @Column({ name: 'canvas_width', type: 'int', default: 1280 })
  canvasWidth!: number;

  @Column({ name: 'canvas_height', type: 'int', default: 720 })
  canvasHeight!: number;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
