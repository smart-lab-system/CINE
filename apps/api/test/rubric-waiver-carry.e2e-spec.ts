import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RubricService } from '../src/grading/rubric.service';
import { seedTeacher } from './helpers/grading-seed';

describe('Đánh dấu "không trừ điểm" theo qua phiên bản rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rubrics: RubricService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    rubrics = app.get(RubricService);
  });
  afterAll(async () => app.close());

  it('T-RBE-WAIVER-1: lưu bản mới chép đánh dấu còn hiệu lực cho tiêu chí còn lại, bỏ tiêu chí đã xoá; đánh dấu đã gỡ không theo sang', async () => {
    const t = await seedTeacher(ds, 'wv');
    const name = `Rubric wv ${Date.now()}`;
    const v1 = await rubrics.saveNewVersion(t, {
      name,
      criteria: [
        { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
        { description: 'Trình bày', maxPoints: 2, key: 'trinh_bay' },
        { description: 'Hiệu năng', maxPoints: 2, key: 'hieu_nang' },
      ],
    });
    const mark = async (key: string, revoked = false) => {
      const [row] = await ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by, revoked_at, revoked_by)
         VALUES ($1, $2, $3, ${revoked ? 'now()' : 'NULL'}, ${revoked ? '$3' : 'NULL'}) RETURNING id`,
        [v1.id, key, t],
      );
      return row.id as string;
    };
    await mark('trinh_bay');
    await mark('hieu_nang');
    await mark('tinh_dung', true);
    const v2 = await rubrics.saveNewVersion(t, {
      name,
      criteria: [
        { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
        { description: 'Trình bày', maxPoints: 4, key: 'trinh_bay' },
      ],
    });
    const carried = await ds.query(
      `SELECT criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL ORDER BY criterion_key`,
      [v2.id],
    );
    expect(carried.map((c: { criterion_key: string }) => c.criterion_key)).toEqual(['trinh_bay']);
    const old = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL`,
      [v1.id],
    );
    expect(old[0].n).toBe(2);
  });

  it('rubric lần đầu (không có bản trước) không sinh đánh dấu nào', async () => {
    const t = await seedTeacher(ds, 'wv-first');
    const v1 = await rubrics.saveNewVersion(t, {
      name: `R ${Date.now()}`,
      criteria: [{ description: 'A', maxPoints: 1, key: 'a' }],
    });
    expect(await ds.query(`SELECT 1 FROM examcollect.criterion_waiver WHERE rubric_id = $1`, [v1.id])).toHaveLength(0);
  });
});
