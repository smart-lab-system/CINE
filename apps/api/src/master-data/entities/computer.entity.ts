import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { RoomEntity } from './room.entity';

export type ComputerStatus = 'active' | 'maintenance' | 'inactive';

@Entity({ name: 'computer' })
@Index('uq_computer_room_hostname', ['roomId', 'hostname'], { unique: true })
@Check('ck_computer_ram_gb', '"ram_gb" > 0')
export class ComputerEntity extends BaseEntity {
  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => RoomEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'room_id' })
  room!: RoomEntity;

  @Column({ type: 'varchar', length: 100 })
  hostname!: string;

  /** Vị trí trong phòng (vd. P01, A-1). */
  @Column({ type: 'varchar', length: 100, default: '' })
  location!: string;

  @Column({ type: 'varchar', length: 200 })
  cpu!: string;

  @Column({ name: 'ram_gb', type: 'int' })
  ramGb!: number;

  @Column({ type: 'varchar', length: 200 })
  storage!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  gpu!: string | null;

  @Column({ type: 'varchar', length: 100 })
  os!: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'mac_address', type: 'varchar', length: 17, nullable: true })
  macAddress!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'maintenance', 'inactive'],
    enumName: 'computer_status',
  })
  status!: ComputerStatus;
}
