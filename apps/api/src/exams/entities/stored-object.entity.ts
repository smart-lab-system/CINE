import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'stored_objects' })
export class StoredObjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'bucket_name', type: 'varchar', length: 63 })
  bucketName!: string;

  @Column({ name: 'object_key', type: 'text' })
  objectKey!: string;

  @Column({ name: 'object_uri', type: 'text' })
  objectUri!: string;

  @Column({ name: 'sha256', type: 'bytea' })
  sha256!: Buffer;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 255, nullable: true })
  contentType!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  etag!: string | null;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
