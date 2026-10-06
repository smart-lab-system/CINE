import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { StudentEntity } from './entities/student.entity';

export interface StudentView {
  mssv: string;
  fullName: string;
}

export interface RosterRow {
  mssv: string;
  name: string;
}

export interface RenamedStudent {
  mssv: string;
  from: string;
  to: string;
}

/** DataSource, EntityManager hay QueryRunner. */
type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
};

const INSERT_CHUNK = 100;

/**
 * Tên sinh viên ở MỘT chỗ (spec §2.6). Trước đây mỗi dòng `enrollment` mang một
 * bản `student_name` riêng: cùng một em ở hai lớp có thể mang hai tên, và gõ
 * MSSV không tra lại được tên đã nhập ở lớp trước.
 *
 * Ba việc, mỗi việc một luật:
 *   - `findNames`: đọc hàng loạt, cho mọi nơi hiện tên (danh sách, ảnh chốt,
 *     điểm danh, thu lại, bài thu).
 *   - `upsertFromRoster`: danh sách lớp của giảng viên — FILE THẮNG, và liệt kê
 *     rõ ai bị đổi tên. Đổi tên áp dụng cho mọi lớp vì chỉ có một tên.
 *   - `ensureKeepingStoredName`: nhập tay và luồng xin phép — MSSV đã có thì
 *     GIỮ tên đã lưu (khoá), không ghi đè bằng tên người gõ.
 *
 * `student` không bao giờ bị xoá tự động: một sinh viên nối qua nhiều học kỳ.
 */
@Injectable()
export class StudentService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByMssv(mssv: string): Promise<StudentView | null> {
    const row = await this.dataSource.getRepository(StudentEntity).findOne({ where: { mssv } });
    return row ? { mssv: row.mssv, fullName: row.fullName } : null;
  }

  /**
   * MSSV (viết thường) -> họ tên. `::citext[]` là BẮT BUỘC: `mssv = ANY($1::text[])`
   * ép cột citext sang text và so PHÂN BIỆT hoa-thường, làm "SV01" và "sv01" thành
   * hai người — đúng lỗi mà kiểu cột citext sinh ra để tránh.
   */
  async findNames(db: Queryable, mssvs: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (mssvs.length === 0) return names;
    const rows: { mssv: string; full_name: string }[] = await db.query(
      `SELECT mssv::text AS mssv, full_name FROM examcollect.student WHERE mssv = ANY($1::citext[])`,
      [mssvs],
    );
    for (const row of rows) names.set(row.mssv.toLowerCase(), row.full_name);
    return names;
  }

  async upsertFromRoster(
    manager: EntityManager,
    rows: RosterRow[],
  ): Promise<{ created: number; renamed: RenamedStudent[] }> {
    const repo = manager.getRepository(StudentEntity);
    const existing = await repo.find({
      where: { mssv: In(rows.map((row) => row.mssv)) },
      // Hai lần import song song không cùng đổi một người, và không cùng tạo một người.
      lock: { mode: 'pessimistic_write' },
    });
    const byMssv = new Map(existing.map((student) => [student.mssv.toLowerCase(), student]));

    const toInsert: { mssv: string; fullName: string }[] = [];
    const renamed: RenamedStudent[] = [];
    for (const row of rows) {
      const name = row.name.trim();
      const current = byMssv.get(row.mssv.toLowerCase());
      if (!current) {
        toInsert.push({ mssv: row.mssv, fullName: name });
        continue;
      }
      if (current.fullName !== name) {
        // MSSV giữ cách viết của lần ghi đầu: chỉ TÊN đổi.
        renamed.push({ mssv: current.mssv, from: current.fullName, to: name });
        await repo.update(current.id, { fullName: name });
      }
    }
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      await repo.insert(toInsert.slice(i, i + INSERT_CHUNK));
    }
    return { created: toInsert.length, renamed };
  }

  async ensureKeepingStoredName(
    manager: EntityManager,
    mssv: string,
    typedName: string,
  ): Promise<string> {
    const repo = manager.getRepository(StudentEntity);
    const existing = await repo.findOne({ where: { mssv } });
    if (existing) return existing.fullName;

    // `orIgnore`: hai giám thị duyệt cùng một em, hoặc hai tab cùng thêm một MSSV mới,
    // cho ra MỘT dòng — không phải một lỗi khoá duy nhất.
    await repo
      .createQueryBuilder()
      .insert()
      .values({ mssv, fullName: typedName.trim() })
      .orIgnore()
      .execute();
    const saved = await repo.findOneOrFail({ where: { mssv } });
    return saved.fullName;
  }
}
