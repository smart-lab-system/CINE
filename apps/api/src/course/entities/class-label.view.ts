import { ViewColumn, ViewEntity } from 'typeorm';

/**
 * View `examcollect.class_label` — MỘT nguồn duy nhất cho nhãn lớp (spec §2.5):
 * mã lớp danh nghĩa + nhóm, kèm học kỳ khi cần phân biệt.
 *
 * Là entity (thay vì chuỗi tên bảng trong `leftJoin('class_label', …)`) vì
 * TypeORM chỉ gắn tên schema vào những bảng nó biết: một tên chuỗi không khớp
 * entity nào bị viết ra không kèm `examcollect.`, và chạy được hay không tuỳ
 * `search_path` của kết nối. `class` được `leftJoin('class', …)` an toàn chính vì
 * nó là một entity.
 *
 * KHÔNG có `expression`: view do migration `ExpandMasterDataEntities` tạo, nên PHẢI khai
 * `synchronize: false` — thiếu nó, bộ dựng schema (`pnpm migration:generate`) thấy một view
 * chưa có trong `typeorm_metadata`, cố tạo từ `expression` rỗng và văng TypeError. Nhãn lớp là BIỂU THỨC, không phải bản chụp — sửa mã lớp
 * danh nghĩa thì mọi nơi đổi nhãn theo, kể cả lớp của kỳ cũ (spec §2.2).
 */
@ViewEntity({ name: 'class_label', synchronize: false })
export class ClassLabelView {
  @ViewColumn({ name: 'class_id' })
  classId!: string;

  /** `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
  @ViewColumn()
  label!: string;

  /** `label` cộng ` · HK1 2026-2027`. */
  @ViewColumn({ name: 'label_with_semester' })
  labelWithSemester!: string;
}
