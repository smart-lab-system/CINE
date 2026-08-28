import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TemplateSeatBlueprint } from '../templates/template-geometry';

@Entity({ name: 'seating_templates' })
export class SeatingTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'canvas_width', type: 'int', default: 1280 })
  canvasWidth!: number;

  @Column({ name: 'canvas_height', type: 'int', default: 720 })
  canvasHeight!: number;

  @Column({ name: 'layout_data', type: 'jsonb' })
  layoutData!: TemplateSeatBlueprint[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
