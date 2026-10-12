import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { buildXlsx, type FixtureSheet } from '../src/grade-export/testing/xlsx-fixture';
import { loginTeacher } from './helpers/grade-export-seed';
import { seedSession } from './helpers/grading-seed';

const GRADEBOOK: FixtureSheet = {
  name: 'Bảng điểm',
  rows: [
    ['BẢNG ĐIỂM LỚP N01'],
    ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ'],
    [1, '20120001', 'Nguyễn Văn An', 7, null],
    [2, '20120002', 'Trần Thị Bình', 8, null],
  ],
};

describe('Tải file sổ điểm mẫu và xem nội dung (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacher: { id: string; token: string };
  let other: { id: string; token: string };
  let sessionId: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** Mint URL → PUT byte thẳng lên MinIO → trả templateId (đúng luồng của trình duyệt). */
  async function upload(bytes: Buffer, over: { token?: string; sessionId?: string; fileName?: string; fileSize?: number } = {}): Promise<string> {
    const res = await http()
      .post(`/exam-sessions/${over.sessionId ?? sessionId}/grade-exports/template-upload`)
      .set(as(over.token ?? teacher.token))
      .send({ fileName: over.fileName ?? 'so-diem.xlsx', fileSize: over.fileSize ?? bytes.length });
    expect(res.status).toBe(201);
    const put = await fetch(res.body.uploadUrl as string, { method: 'PUT', body: new Uint8Array(bytes) });
    expect(put.ok).toBe(true);
    return res.body.templateId as string;
  }
  const inspect = (body: object, token = teacher.token, id = sessionId) =>
    http().post(`/exam-sessions/${id}/grade-exports/inspect`).set(as(token)).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    teacher = await loginTeacher(app, ds, 'insp-a');
    other = await loginTeacher(app, ds, 'insp-b');
    sessionId = (await seedSession(ds, 'gx-inspect', { teacherId: teacher.id })).sessionId;
  }, 60_000);
  afterAll(async () => app.close());

  it('tải lên qua URL ký, rồi xem: trang tính, yêu cầu nộp, lưới có chữ cột và kiểu ô', async () => {
    const templateId = await upload(await buildXlsx([GRADEBOOK]));
    const res = await inspect({ templateId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      templateId,
      sheets: [{ name: 'Bảng điểm', hidden: false }],
      deliverables: [{ requiredFilename: 'Cau1.docx' }],
      sheet: { name: 'Bảng điểm', rowCount: 4, columnCount: 5, protected: false, fromRow: 1, columns: ['A', 'B', 'C', 'D', 'E'], hasMore: false },
    });
    expect(res.body.fileSizeBytes).toBeGreaterThan(0);
    expect(res.body.sheet.rows[1].cells.map((c: { text: string }) => c.text)).toEqual(['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ']);
    expect(res.body.sheet.rows[2].cells[0]).toEqual({ text: '1', kind: 'number', formula: false });
  });

  it('nhiều trang tính: không chọn thì không có lưới (không đoán trang); chọn rồi mới có', async () => {
    const templateId = await upload(await buildXlsx([GRADEBOOK, { name: 'Ghi chú', rows: [['x']] }]));
    const none = await inspect({ templateId });
    expect(none.status).toBe(200);
    expect(none.body.sheets.map((s: { name: string }) => s.name)).toEqual(['Bảng điểm', 'Ghi chú']);
    expect(none.body.sheet).toBeNull();
    const chosen = await inspect({ templateId, sheetName: 'Ghi chú' });
    expect(chosen.body.sheet.name).toBe('Ghi chú');
  });

  it('phân trang lưới bằng fromRow', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => [i + 1, `SV${String(i).padStart(6, '0')}`]);
    const templateId = await upload(await buildXlsx([{ name: 'S', rows }]));
    const page = await inspect({ templateId, fromRow: 81 });
    expect(page.body.sheet.rows[0].row).toBe(81);
    expect(page.body.sheet.rows).toHaveLength(20);
    expect(page.body.sheet.hasMore).toBe(false);
  });

  it('sai đuôi file → 400 nói cách chuyển sang .xlsx; quá 5 MB khai → 400', async () => {
    const bad = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(teacher.token)).send({ fileName: 'so-diem.csv', fileSize: 100 });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain('Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.');
    const big = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(teacher.token)).send({ fileName: 'a.xlsx', fileSize: 6 * 1024 * 1024 });
    expect(big.status).toBe(400);
    expect(big.body.message).toContain('File quá lớn (giới hạn 5 MB).');
  });

  it('server TỰ đo kích thước: khai 100 byte nhưng đẩy lên hơn 5 MiB → 400', async () => {
    const templateId = await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 0x50), { fileSize: 100 });
    const res = await inspect({ templateId });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File quá lớn (giới hạn 5 MB).');
  });

  it('chưa tải gì lên → 400 "Chưa thấy file"', async () => {
    const res = await inspect({ templateId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Chưa thấy file trên kho lưu trữ — hãy tải lên trước.');
  });

  it('mỗi loại file xấu nhận đúng câu của nó', async () => {
    const good = await buildXlsx([GRADEBOOK]);
    const cases: [string, Buffer, string][] = [
      ['không phải zip', Buffer.from('MSSV,Điểm\n1,2\n'), 'Đây không phải file .xlsx.'],
      ['.xls / có mật khẩu', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(200)]), 'File có mật khẩu hoặc là định dạng .xls cũ'],
      ['hỏng', good.subarray(0, Math.floor(good.length / 2)), 'File .xlsx bị hỏng hoặc không đọc được.'],
      ['macro', await buildXlsx([GRADEBOOK], { workbookContentType: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' }), 'File có macro (.xlsm)'],
      ['tiền tố namespace', await buildXlsx([GRADEBOOK], { prefixed: true }), 'Cấu trúc file không được hỗ trợ'],
    ];
    for (const [name, bytes, message] of cases) {
      const templateId = await upload(bytes);
      const res = await inspect({ templateId, sheetName: 'Bảng điểm' });
      expect({ name, status: res.status }).toEqual({ name, status: 400 });
      expect({ name, message: res.body.message as string }).toEqual({ name, message: expect.stringContaining(message) });
    }
  });

  it('trang tính không có tên đó → 400 nêu tên', async () => {
    const templateId = await upload(await buildXlsx([GRADEBOOK]));
    const res = await inspect({ templateId, sheetName: 'Không có' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Không thấy trang tính "Không có" trong file.');
  });

  it('templateId không phải uuid → 400; không đăng nhập → 401', async () => {
    expect((await inspect({ templateId: 'abc' })).status).toBe(400);
    expect((await http().post(`/exam-sessions/${sessionId}/grade-exports/inspect`).send({ templateId: '00000000-0000-4000-8000-000000000000' })).status).toBe(401);
  });

  it('giảng viên khác không xin URL và không xem được phiên này → 403', async () => {
    const templateId = await upload(await buildXlsx([GRADEBOOK]));
    expect((await inspect({ templateId }, other.token)).status).toBe(403);
    const mint = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(other.token)).send({ fileName: 'a.xlsx', fileSize: 10 });
    expect(mint.status).toBe(403);
  });

  it('file mẫu của phiên khác không dùng được — khoá dựng từ phiên, nên trỏ vào object không tồn tại', async () => {
    const second = (await seedSession(ds, 'gx-inspect-2', { teacherId: teacher.id, startHoursAgo: 6 })).sessionId;
    const templateId = await upload(await buildXlsx([GRADEBOOK]), { sessionId: second });
    expect((await inspect({ templateId }, teacher.token, second)).status).toBe(200);
    const res = await inspect({ templateId }, teacher.token, sessionId);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Chưa thấy file trên kho lưu trữ — hãy tải lên trước.');
  });
});
