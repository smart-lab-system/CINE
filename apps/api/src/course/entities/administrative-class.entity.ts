import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Lớp danh nghĩa — `DHKTPM18A`. Lưu thành BẢNG RIÊNG để DB kiểm chứng sự tồn tại
 * và chống trùng (spec §2.2): một cột chữ trên `class` là đúng lỗi cũ.
 *
 * Giảng viên KHÔNG có trang, route hay bộ lọc riêng cho nó; họ chỉ thấy nhãn gộp
 * `mã – nhóm` (view `class_label`). Mã chỉ được tạo trong Danh mục của admin
 * (nhập tay hoặc import); form tạo lớp chỉ CHỌN.
 *
 * `code` viết hoa và cắt khoảng trắng ở tầng ghi; CHECK ép lại ở DB.
 */
@Entity({ name: 'administrative_class' })
@Index('uq_administrative_class_code', ['code'], { unique: true })
@Check(
  'ck_administrative_class_code',
  `"code"::text ~ '^[A-Z0-9]{3,30}$' AND "code"::text = upper("code"::text)`,
)
export class AdministrativeClassEntity extends BaseEntity {
  @Column({ type: 'citext' })
  code!: string;
}
