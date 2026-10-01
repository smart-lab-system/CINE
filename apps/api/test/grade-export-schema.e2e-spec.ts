import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { seedSession } from './helpers/grading-seed';

describe('Lượt xuất sổ điểm — bảng và ràng buộc (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function newExport(label: string) {
    const ctx = await seedSession(ds, label);
    const [row] = await ds.query(
      `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column)
       VALUES ($1, $2, 'grade-exports/x/templates/y', 'B', 'F')
       RETURNING id, rounding_step_hundredths, rounding_mode, written_count, blank_count, overwrite_count, decrease_count,
                 sheet_name, reason_column, required_deliverable_id, decrease_confirmed_by`,
      [ctx.sessionId, ctx.teacherId],
    );
    return { ctx, exportId: row.id as string, row };
  }
  const insertRow = (exportId: string, mssv: string, written: number | null, reason: string | null, fileRow = 5) =>
    ds.query(
      `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [exportId, fileRow, mssv, written, reason],
    );

  it('các cột mới có mặc định: làm tròn 0,01 nửa lên, mọi bộ đếm 0, người xác nhận null', async () => {
    const { row } = await newExport('gx-defaults');
    expect(row).toMatchObject({
      rounding_step_hundredths: 1, rounding_mode: 'half_up',
      written_count: 0, blank_count: 0, overwrite_count: 0, decrease_count: 0,
      sheet_name: null, reason_column: null, required_deliverable_id: null, decrease_confirmed_by: null,
    });
  });

  it('một dòng HOẶC ghi điểm HOẶC trống có lý do — cả hai hay không cái nào đều bị CHECK từ chối', async () => {
    const { exportId } = await newExport('gx-oneof');
    await insertRow(exportId, 'SV000001', 750, null);
    await insertRow(exportId, 'SV000002', null, 'absent');
    await expect(insertRow(exportId, 'SV000003', 750, 'absent')).rejects.toThrow(/ck_grade_export_row_one_of/);
    await expect(insertRow(exportId, 'SV000004', null, null)).rejects.toThrow(/ck_grade_export_row_one_of/);
  });

  it('điểm đã ghi không âm', async () => {
    const { exportId } = await newExport('gx-nonneg');
    await expect(insertRow(exportId, 'SV000005', -1, null)).rejects.toThrow(/check/i);
  });

  it('một MSSV một lần trong một lượt, KHÔNG phân biệt hoa/thường (citext)', async () => {
    const { exportId } = await newExport('gx-unique');
    await insertRow(exportId, 'sv000001', 100, null);
    await expect(insertRow(exportId, 'SV000001', 200, null, 6)).rejects.toThrow(/uq_grade_export_row_mssv/);
  });

  it('lý do trống ngoài bốn giá trị bị enum từ chối', async () => {
    const { exportId } = await newExport('gx-enum');
    await expect(insertRow(exportId, 'SV000006', null, 'lazy')).rejects.toThrow(/grade_export_blank_reason/);
  });

  it('bước làm tròn ngoài {1, 10, 25, 50} bị từ chối', async () => {
    const ctx = await seedSession(ds, 'gx-step');
    await expect(
      ds.query(
        `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column, rounding_step_hundredths)
         VALUES ($1, $2, 'k', 'B', 'F', 5)`,
        [ctx.sessionId, ctx.teacherId],
      ),
    ).rejects.toThrow(/ck_grade_export_rounding_step/);
  });

  it('cả hai bảng chỉ-thêm: UPDATE và DELETE đều bị từ chối', async () => {
    const { exportId } = await newExport('gx-append');
    await insertRow(exportId, 'SV000007', 100, null);
    await expect(ds.query(`UPDATE examcollect.grade_export SET mssv_column = 'C' WHERE id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
    await expect(ds.query(`DELETE FROM examcollect.grade_export WHERE id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
    await expect(
      ds.query(`UPDATE examcollect.grade_export_row SET written_hundredths = 0 WHERE grade_export_id = $1`, [exportId]),
    ).rejects.toThrow(/chỉ thêm/);
    await expect(ds.query(`DELETE FROM examcollect.grade_export_row WHERE grade_export_id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
  });
});
