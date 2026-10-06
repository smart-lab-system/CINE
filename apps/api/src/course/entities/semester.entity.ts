import { Check, Column, Entity, Exclusion, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Học kỳ: một năm học có BA kỳ (spec §2.1). Tên là biểu thức của (năm, kỳ) —
 * `HK1 2026-2027` — không có cột `name`, nên không có hai chỗ để nhãn lệch nhau.
 *
 * Học kỳ là một THỰC THỂ có ngày nhưng KHÔNG phải một TRẠNG THÁI: không có cờ
 * "kỳ hiện tại", và không có luật nào từ chối một thao tác vì lý do ngày kỳ
 * (CLAUDE.md §1.2). Ngày chỉ phục vụ việc chống chồng kỳ và sắp xếp.
 *
 * Bất biến ở DB (migration `ExpandMasterDataEntities`), không chỉ ở service:
 * không chồng ngày; không đổi `academic_year_start`/`term` khi đã có lớp.
 */
@Entity({ name: 'semester' })
@Index('uq_semester_year_term', ['academicYearStart', 'term'], { unique: true })
@Check('ck_semester_term', 'term IN (1, 2, 3)')
@Check('ck_semester_dates', 'end_date >= start_date')
@Check('ck_semester_year', 'academic_year_start BETWEEN 2000 AND 2999')
@Exclusion(
  'ex_semester_dates_overlap',
  `USING gist (daterange("start_date", "end_date", '[]') WITH &&)`,
)
export class SemesterEntity extends BaseEntity {
  /** 2026 nghĩa là năm học 2026-2027. */
  @Column({ name: 'academic_year_start', type: 'int' })
  academicYearStart!: number;

  @Column({ type: 'smallint' })
  term!: number;

  /** `yyyy-mm-dd`. TypeORM trả cột `date` về dạng chuỗi, không phải Date. */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;
}
