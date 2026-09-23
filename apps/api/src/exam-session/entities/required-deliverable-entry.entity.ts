import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { RequiredDeliverableEntity } from './required-deliverable.entity';

/**
 * Một file phải nằm BÊN TRONG một deliverable dạng nén (`.zip`/`.rar`).
 *
 * Deliverable không có dòng nào ở đây = không kiểm bên trong. KHÔNG có cờ
 * bật/tắt riêng, và đó là cùng lý lẽ `filename-template.ts` đã viết cho
 * chính nó: "A deliverable is templated iff its declared name contains a
 * token. There is no separate flag: a flag would be a second fact about the
 * same string that could disagree with it."
 *
 * `entry_name` là một MẪU, chịu đúng `FILENAME_TEMPLATE_REGEX` như tên file
 * bên ngoài — nên token `{MSSV} {TEN} {PHONG} {SOMAY}` dùng được, và luật
 * chống path traversal áp y hệt. Đặc biệt là ký tự `/` vẫn bị cấm: phép
 * khớp không nhìn đường dẫn (spec §3.2), nên khai đường dẫn là vô nghĩa, và
 * cấm ngay từ lúc khai thì giảng viên biết ngay thay vì tưởng mình đã khai
 * được một thứ hệ thống lặng lẽ bỏ qua.
 */
@Entity({ name: 'required_deliverable_entry' })
@Index('uq_deliverable_entry_name', ['requiredDeliverableId', 'entryName'], { unique: true })
export class RequiredDeliverableEntryEntity extends BaseEntity {
  @Column({ name: 'required_deliverable_id', type: 'uuid' })
  requiredDeliverableId!: string;

  /**
   * `CASCADE` chứ không `RESTRICT` — lệch khỏi mặc định của schema này, có
   * chủ đích: danh sách bên trong không có nghĩa nào độc lập với deliverable
   * nó mô tả, nên giữ lại một dòng mồ côi chỉ tạo rác.
   */
  @ManyToOne(() => RequiredDeliverableEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'required_deliverable_id' })
  requiredDeliverable!: RequiredDeliverableEntity;

  @Column({ name: 'entry_name', type: 'varchar', length: 255 })
  entryName!: string;
}
