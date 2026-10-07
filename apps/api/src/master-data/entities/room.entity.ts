import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type RoomStatus = 'available' | 'maintenance' | 'retired';

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

  @Column({
    type: 'enum',
    enum: ['available', 'maintenance', 'retired'],
    enumName: 'room_status',
  })
  status!: RoomStatus;
}
