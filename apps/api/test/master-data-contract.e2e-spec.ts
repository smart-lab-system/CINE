import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ContractMasterDataEntities1789700000000 } from '../src/database/migrations/1789700000000-ContractMasterDataEntities';
import { seedTeacher } from './helpers/grading-seed';
import { randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment } from './helpers/seed';

/**
 * Trạng thái ĐÍCH sau migration thu hẹp. Chạy trên DB đã áp migration — sau khi áp, schema ở đây là schema thật; trước khi áp các ca này đỏ (đó là Step 3).
 * Không thử CHÈN hàng sai (guard `e2e-seed-hygiene` cấm SQL thô dựng lớp/enrollment/phiên ngoài helper): kiểm catalog, và kiểm khoá ngoại bằng một câu DELETE.
 */
describe('master data — trạng thái đích sau thu hẹp (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const columnsOf = async (table: string): Promise<string[]> =>
    (await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1`, [table])).map(
      (r: { column_name: string }) => r.column_name,
    );
  const nullable = async (table: string, column: string): Promise<boolean> => {
    const [row] = await ds.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return row.is_nullable === 'YES';
  };
  const constraintNames = async (): Promise<string[]> =>
    (await ds.query(`SELECT conname FROM pg_constraint WHERE connamespace = 'examcollect'::regnamespace`)).map((r: { conname: string }) => r.conname);

  it('hai cột cũ đã bỏ: class.name và enrollment.student_name', async () => {
    expect(await columnsOf('class')).not.toContain('name');
    expect(await columnsOf('enrollment')).not.toContain('student_name');
  });

  it('bản chụp tên (session_roster.student_name, submission.student_name_input) VẪN còn — chúng là ảnh chụp lúc thi, không phải bản sao của student', async () => {
    expect(await columnsOf('session_roster')).toContain('student_name');
    expect(await columnsOf('submission')).toContain('student_name_input');
  });

  it('NOT NULL: class.semester_id, class.administrative_class_id, exam_session.room_id', async () => {
    expect(await nullable('class', 'semester_id')).toBe(false);
    expect(await nullable('class', 'administrative_class_id')).toBe(false);
    expect(await nullable('exam_session', 'room_id')).toBe(false);
  });

  it('chống trùng phòng chỉ còn theo room_id: bản theo TÊN (legacy) đã bỏ, bản mới còn', async () => {
    const names = await constraintNames();
    expect(names).not.toContain('ex_exam_session_room_overlap_legacy');
    expect(names).toContain('ex_exam_session_room_overlap');
  });

  it('khoá ngoại enrollment → student có mặt và RESTRICT: xoá một sinh viên còn enrollment bị từ chối (23503)', async () => {
    expect(await constraintNames()).toContain('fk_enrollment_student');
    const teacherId = await seedTeacher(ds, `ct-${randomTag(6)}`);
    const klass = await seedClass(ds, { teacherId });
    const mssv = `CT${randomTag(8)}`;
    await seedEnrollment(ds, { classId: klass.id, teacherId, mssv, name: 'Sinh viên kiểm thử' });
    await expect(ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [mssv])).rejects.toMatchObject({ code: '23503' });
  });

  it('view class_label không còn nhánh dự phòng về class.name, và mọi lớp đều có nhãn', async () => {
    const [view] = await ds.query(`SELECT pg_get_viewdef('examcollect.class_label'::regclass) AS def`);
    expect(view.def).not.toMatch(/\bc\.name\b/);
    const [missing] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.class c LEFT JOIN examcollect.class_label l ON l.class_id = c.id WHERE l.label IS NULL`,
    );
    expect(missing.n).toBe(0);
  });

  it('migration thu hẹp KHÔNG đảo ngược được: down() ném lỗi trỏ tới bản dump', async () => {
    await expect(new ContractMasterDataEntities1789700000000().down()).rejects.toThrow(/dump|sao lưu/i);
  });
});
