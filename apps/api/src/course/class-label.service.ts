import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Nhãn hiển thị của lớp, đọc từ view `class_label` — cách DUY NHẤT để lấy "tên
 * lớp" từ khi `class.name` bị bỏ (spec §2.5). Giảng viên chỉ thấy MỘT nhãn ở mọi
 * nơi hiện tên lớp: không có trang, route hay bộ lọc riêng cho lớp danh nghĩa.
 *
 * Một truy vấn cho cả danh sách id (tối đa vài trăm), không phải một truy vấn
 * mỗi lớp. Id không có thật không xuất hiện trong bản đồ — người gọi quyết định
 * điền gì thay.
 */
@Injectable()
export class ClassLabelService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  labelsFor(classIds: string[]): Promise<Map<string, string>> {
    return this.read('label', classIds);
  }

  labelsWithSemesterFor(classIds: string[]): Promise<Map<string, string>> {
    return this.read('label_with_semester', classIds);
  }

  private async read(column: 'label' | 'label_with_semester', classIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (classIds.length === 0) return map;
    const rows: { class_id: string; label: string }[] = await this.dataSource.query(
      `SELECT class_id, ${column} AS label FROM examcollect.class_label WHERE class_id = ANY($1::uuid[])`,
      [classIds],
    );
    for (const row of rows) map.set(row.class_id, row.label);
    return map;
  }
}
