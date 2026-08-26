import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Common columns for entity-driven (TypeORM-managed) tables. Deliberately
 * NOT decorated with @Entity() — it's a column mixin extended by concrete
 * entities (TypeORM's "concrete table inheritance"), not a mapped table of
 * its own. Registering it directly in a DataSource's `entities` array would
 * make TypeORM try to create a real `base_entity` table, which is not the
 * intent.
 *
 * No soft-delete column here: this schema uses hard deletes everywhere,
 * protected by `ON DELETE RESTRICT` foreign keys — a row with active
 * children simply can't be deleted, no separate soft-delete/guard-trigger
 * layer needed on top of that.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
