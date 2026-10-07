import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type RoomStatus = 'active' | 'maintenance' | 'inactive';

@Entity({ name: 'room' })
@Check('ck_room_capacity', '"capacity" > 0')
export class RoomEntity extends BaseEntity {
  @Index('uq_room_code', { unique: true })
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  building!: string | null;

  /** Tầng trong tòa — chuỗi để nhận "1", "G", "B1". */
  @Column({ type: 'varchar', length: 50, nullable: true })
  floor!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'maintenance', 'inactive'],
    enumName: 'room_status',
  })
  status!: RoomStatus;
}
