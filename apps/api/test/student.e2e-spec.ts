import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { StudentService } from '../src/course/student.service';
import { randomTag } from './helpers/master-data';

describe('StudentService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let students: StudentService;
  const made: string[] = [];

  /** MSSV duy nhất mỗi lần, 4–20 ký tự chữ/số. */
  const mssv = () => `ST${randomTag(10)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    students = app.get(StudentService, { strict: false });
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.student WHERE mssv = ANY($1::citext[])`, [made]).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  const nameOf = async (m: string) =>
    (await ds.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [m]))[0]?.full_name;

  describe('findByMssv / findNames', () => {
    it('tìm không phân biệt hoa-thường và trả MSSV theo cách đã lưu', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyễn Văn A')`, [id]);
      expect(await students.findByMssv(id.toLowerCase())).toEqual({ mssv: id, fullName: 'Nguyễn Văn A' });
      expect(await students.findByMssv(`ZZ${randomTag(8)}`)).toBeNull();
    });

    it('findNames so khớp bằng citext: gõ khác hoa-thường vẫn ra (Review Focus 2)', async () => {
      const a = mssv();
      const b = mssv();
      made.push(a, b);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Trần Thị B'), ($2, 'Lê Văn C')`, [a, b]);
      const names = await students.findNames(ds, [a.toLowerCase(), b.toUpperCase(), `KHONG${randomTag(8)}`]);
      expect(names.get(a.toLowerCase())).toBe('Trần Thị B');
      expect(names.get(b.toLowerCase())).toBe('Lê Văn C');
      expect(names.size).toBe(2);
    });

    it('danh sách rỗng thì bản đồ rỗng', async () => {
      expect((await students.findNames(ds, [])).size).toBe(0);
    });
  });

  describe('upsertFromRoster — file thắng', () => {
    it('tạo sinh viên mới và đếm đúng', async () => {
      const a = mssv();
      const b = mssv();
      made.push(a, b);
      const result = await ds.transaction((m) =>
        students.upsertFromRoster(m, [{ mssv: a, name: 'Sinh viên A' }, { mssv: b, name: 'Sinh viên B' }]),
      );
      expect(result).toEqual({ created: 2, renamed: [] });
      expect(await nameOf(a)).toBe('Sinh viên A');
    });

    it('tên khác thì ĐỔI và LIỆT KÊ (từ, thành), tên giống thì không đụng', async () => {
      const changed = mssv();
      const same = mssv();
      made.push(changed, same);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyen Van I'), ($2, 'Trần Thị J')`, [changed, same]);

      const result = await ds.transaction((m) =>
        students.upsertFromRoster(m, [
          { mssv: changed.toLowerCase(), name: 'Nguyễn Văn I' },
          { mssv: same, name: 'Trần Thị J' },
        ]),
      );

      expect(result.created).toBe(0);
      expect(result.renamed).toEqual([{ mssv: changed, from: 'Nguyen Van I', to: 'Nguyễn Văn I' }]);
      expect(await nameOf(changed)).toBe('Nguyễn Văn I');
      expect(await nameOf(same)).toBe('Trần Thị J');
    });

    it('MSSV giữ cách viết của lần ghi đầu, kể cả khi file gõ khác hoa-thường', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Giữ nguyên')`, [id]);
      await ds.transaction((m) => students.upsertFromRoster(m, [{ mssv: id.toLowerCase(), name: 'Giữ nguyên' }]));
      const [row] = await ds.query(`SELECT mssv::text AS mssv FROM examcollect.student WHERE mssv = $1`, [id]);
      expect(row.mssv).toBe(id);
    });

    it('cắt khoảng trắng đầu-cuối của tên trước khi so và ghi', async () => {
      const id = mssv();
      made.push(id);
      await ds.transaction((m) => students.upsertFromRoster(m, [{ mssv: id, name: '  Có khoảng trắng  ' }]));
      expect(await nameOf(id)).toBe('Có khoảng trắng');
    });
  });

  describe('ensureKeepingStoredName', () => {
    it('chưa có thì tạo bằng tên gõ và trả tên đó', async () => {
      const id = mssv();
      made.push(id);
      const name = await ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Em gõ tên'));
      expect(name).toBe('Em gõ tên');
      expect(await nameOf(id)).toBe('Em gõ tên');
    });

    it('có rồi thì GIỮ tên đã lưu, bỏ qua tên gõ (Review Focus 3)', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Tên đã lưu')`, [id]);
      const name = await ds.transaction((m) => students.ensureKeepingStoredName(m, id.toLowerCase(), 'Tên em gõ lệch'));
      expect(name).toBe('Tên đã lưu');
      expect(await nameOf(id)).toBe('Tên đã lưu');
    });

    it('hai lần gọi chạy đua trên cùng MSSV mới không nổ và cùng ra một tên', async () => {
      const id = mssv();
      made.push(id);
      const [first, second] = await Promise.all([
        ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Tên thứ nhất')),
        ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Tên thứ hai')),
      ]);
      expect(first).toBe(second);
      expect(['Tên thứ nhất', 'Tên thứ hai']).toContain(first);
    });
  });
});
