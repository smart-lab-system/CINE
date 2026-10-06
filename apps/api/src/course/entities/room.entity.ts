import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Phòng thi — một danh mục do admin khai, giảng viên chỉ chọn (spec §2.4).
 *
 * `is_active = false` nghĩa là KHÔNG CHỌN ĐƯỢC cho phiên mới; phiên cũ vẫn trỏ
 * tới được. Kiểm ở service chứ không ở ràng buộc DB, vì lịch sử phải tham chiếu
 * được một phòng đã ngừng.
 *
 * Tên: cắt khoảng trắng đầu-cuối và gộp khoảng trắng liên tiếp ở tầng ghi
 * (`normalizeRoomName`), DB ép lại bằng `ck_room_name`.
 */
@Entity({ name: 'room' })
@Index('uq_room_name', ['name'], { unique: true })
@Check(
  'ck_room_name',
  `"name"::text = btrim("name"::text) AND "name"::text !~ '\\s{2,}' AND length("name"::text) BETWEEN 1 AND 100`,
)
@Check('ck_room_capacity', '"capacity" IS NULL OR "capacity" BETWEEN 1 AND 1000')
export class RoomEntity extends BaseEntity {
  @Column({ type: 'citext' })
  name!: string;

  /** Chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
