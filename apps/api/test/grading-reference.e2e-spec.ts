import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { StorageService } from '../src/storage/storage.service';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus } from './helpers/grading-seed';
import { ExamMaterialService } from '../src/exam-session/exam-material.service';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';

// Tên rubric phải duy nhất theo LƯỢT CHẠY: uq_rubric_teacher_name_version
// sống qua nhiều lượt, còn tên môn trong bộ fixture này là hằng chuỗi.
const RUBRIC_STAMP = Date.now().toString(36);

/**
 * Tài liệu tham chiếu để chấm (spec §3).
 *
 * Ca quan trọng nhất ở đây là T-SEC-1: đáp án mẫu KHÔNG BAO GIỜ được lọt
 * vào `listForAgent`. Đó là loại lỗi không sửa lại được sau khi đã xảy ra —
 * một khi 40 máy sinh viên đã tải về đáp án thì không có bản vá nào lấy
 * lại được.
 */
describe('Tài liệu tham chiếu để chấm (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let materials: ExamMaterialService;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;
  let courseName: string;

  const PASSWORD = 'correct-horse-battery';
  let seedCursor = 0;
  let rubricVersionCursor = 0;

  interface Seeded {
    id: string;
    entity: ExamSessionEntity;
    materialId: string;
    classId: string;
    deliverableId: string;
  }

  async function seedSession(): Promise<Seeded> {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm ${suffix}`, teacherId],
    );
    const room = { name: `P Ref ${suffix}` };
    // `start_time` ở QUÁ KHỨ: `listForAgent` chỉ phát tài liệu sau mốc đó,
    // nên muốn chứng minh đáp án không lọt thì phải kiểm ở trạng thái ĐÃ
    // PHÁT, không phải ở trạng thái còn khoá.
    //
    // GIÃN theo `seedCursor`, mỗi phiên lùi thêm 3 giờ: mọi phiên ở đây do
    // CÙNG một giảng viên tạo, và `ex_exam_session_teacher_gap` (migration
    // 1789350000000) đòi hai phiên của một người cách nhau >= 30 phút. Trước
    // khi có ràng buộc đó, cả spec dùng chung một khung giờ và không ai để ý.
    const hoursBack = seedCursor * 3;
    const [session] = await dataSource.query(
      `INSERT INTO examcollect.exam_session
         (name, code, class_id, teacher_id, exam_type,
          start_time, end_time, status, semester_name,
          course_name, room_name)
       VALUES ($1, $2, $3, $5, 'CK',
               now() - ($7::int || ' hours')::interval,
               now() - (($7::int - 1) || ' hours')::interval,
               'active', 'HK Ref', $4, $6)
       RETURNING *`,
      [
        `Phiên ${suffix}`,
        `REF${suffix}`.slice(0, 20),
        klass.id,
        courseName,
        teacherId,
        room.name,
        hoursBack,
      ],
    );
    const [deliverable] = await dataSource.query(
      `INSERT INTO examcollect.required_deliverable
         (exam_session_id, required_filename, deliverable_type)
       VALUES ($1, 'Cau1.docx', 'document') RETURNING id`,
      [session.id],
    );
    const [material] = await dataSource.query(
      `INSERT INTO examcollect.exam_material
         (exam_session_id, storage_key, file_name, file_size)
       VALUES ($1, $2, 'DeThi.pdf', 1024) RETURNING id`,
      [session.id, `materials/${session.id}/de-thi`],
    );

    return {
      id: session.id,
      entity: await dataSource.getRepository(ExamSessionEntity).findOneByOrFail({ id: session.id }),
      materialId: material.id,
      classId: klass.id,
      deliverableId: deliverable.id,
    };
  }

  /** Một dòng `grading_result` ở `ai_grading` — đang chấm, nên kích hoạt luật đóng băng. */
  async function seedGradingResult(session: Seeded): Promise<string> {
    const mssv = `REF${seedCursor}${Date.now() % 100000}`.slice(0, 20);
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'SV', $4, $5, 'received') RETURNING id`,
      [session.id, session.deliverableId, mssv, session.classId, teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await dataSource.query(
        `UPDATE examcollect.submission SET status = $1 WHERE id = $2`,
        [next, submission.id],
      );
    }
    rubricVersionCursor += 1;
    const [rubric] = await dataSource.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name)
       VALUES ($2, $3, $1) RETURNING id`,
      [`${courseName} ${RUBRIC_STAMP}`, rubricVersionCursor, teacherId],
    );
    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submission.id, rubric.id, teacherId],
    );
    return result.id;
  }

  function setReference(sessionId: string, body: object, token = teacherToken) {
    return request(app.getHttpServer())
      .put(`/exam-sessions/${sessionId}/grading-reference`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function readiness(sessionId: string, token = teacherToken) {
    return request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-readiness`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function referenceRow(sessionId: string): Promise<{ model_answer_set_at: Date | null }> {
    const [row] = await dataSource.query(
      `SELECT model_answer_set_at FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [sessionId],
    );
    return row;
  }
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    materials = app.get(ExamMaterialService);

    const email = `ref_gv_${Date.now()}@example.com`;
    teacherId = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    teacherToken = (
      await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD })
    ).body.accessToken;

    const otherEmail = `ref_gv_other_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: PASSWORD,
      role: 'teacher',
    });
    otherTeacherToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherEmail, password: PASSWORD })
    ).body.accessToken;

    const course = { name: 'Môn tài liệu' };
    courseName = course.name;
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-SEC-1: đáp án mẫu KHÔNG BAO GIỜ lọt vào listForAgent', async () => {
    // `ExamMaterialService.listForAgent` trả về MỌI dòng `exam_material`
    // của phiên kèm URL tải, ngay khi qua `start_time`, không lọc theo
    // loại. Đó là lý do đáp án mẫu phải ở bảng RIÊNG với prefix storage
    // RIÊNG — không phải một cột `is_secret` trên bảng cũ, vì một cột như
    // thế chỉ cần một câu query quên `WHERE` là rò.
    const session = await seedSession();
    const SECRET = 'ĐÁP ÁN BÍ MẬT: câu 2 chọn quy hoạch động';

    await setReference(session.id, {
      questionMaterialId: session.materialId,
      modelAnswerNote: SECRET,
    }).expect(200);

    const agentView = await materials.listForAgent(session.entity, new Date());

    expect(agentView.released).toBe(true);
    const blob = JSON.stringify(agentView);
    expect(blob).not.toContain(SECRET);
    expect(blob).not.toContain('grading-reference/');
    // Và đề bài thì VẪN phải phát — sinh viên cần nó.
    expect(blob).toContain('DeThi.pdf');
  });

  it('T-FREEZE-1: phiên có bài đang chấm → sửa tài liệu trả 409 (§2.3 luật 6)', async () => {
    // Cùng luật với `setSessionRubric`: 20 bài đầu chấm có đáp án mẫu, 20
    // bài sau chấm với đáp án đã sửa, là hai kỳ thi khác nhau đội lốt một.
    // Một bài ĐANG CHẤM đã là khoá: lô đang chạy mà chưa bài nào ra điểm thì
    // sửa thước vẫn là hai thước trong một phiên.
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'ghi chú ban đầu' }).expect(200);

    await seedGradingResult(session);

    const res = await setReference(session.id, { modelAnswerNote: 'đổi giữa chừng' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/mang điểm hoặc đang chấm/i);
  });

  it('T-FREEZE-3 (qua route): phiên chỉ có bài không chấm được → sửa tài liệu ĐƯỢC', async () => {
    // Luật cũ (*"có một dòng kết quả là khoá"*) làm một lần sandbox sập kẹt cả phiên: bài không
    // chấm được chưa bị đo bằng thước nào, nên sửa thước lúc này không đẻ ra hai kỳ thi.
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'ghi chú ban đầu' }).expect(200);

    const resultId = await seedGradingResult(session);
    await forceStatus(dataSource, resultId, 'flagged_for_review', {
      ungradable_class: 'system', ungradable_reason: 'sandbox chết', confidence: 0,
    });

    await setReference(session.id, { modelAnswerNote: 'sửa thước sau lượt hỏng' }).expect(200);
  });

  it('T-DEGRADE-1: chưa có tài liệu thì readiness trả mức 1, KÈM cảnh báo', async () => {
    // Mức 1 là mức hệ thống chạy hôm nay, ÂM THẦM. Không cấm — nhưng
    // không để nó im lặng.
    const session = await seedSession();

    const res = await readiness(session.id).expect(200);

    expect(res.body.level).toBe('rubric_only');
    expect(res.body.hasQuestion).toBe(false);
    expect(res.body.warning).toMatch(/không phát hiện được/i);
  });

  it('có đề nhưng chưa có đáp án mẫu → mức 2, cảnh báo KHÁC', async () => {
    // Hai mức suy giảm khác nhau cần hai câu khác nhau: "chưa có đề" và
    // "chưa biết cách chấm của thầy" là hai thiếu sót khác hẳn nhau.
    const session = await seedSession();
    await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

    const res = await readiness(session.id).expect(200);

    expect(res.body.level).toBe('with_question');
    expect(res.body.warning).toMatch(/chưa biết cách chấm/i);
  });

  it('đủ đề + ghi chú → mức 3, KHÔNG cảnh báo', async () => {
    const session = await seedSession();
    await setReference(session.id, {
      questionMaterialId: session.materialId,
      modelAnswerNote: 'Câu 2 chấp nhận cả quy hoạch động.',
    }).expect(200);

    const res = await readiness(session.id).expect(200);

    expect(res.body.level).toBe('with_model_answer');
    expect(res.body.warning).toBeNull();
  });

  it('gửi lại một trường KHÔNG làm mất trường đã đặt trước đó', async () => {
    // Giảng viên thêm ghi chú sau khi đã chọn đề không được làm mất lựa
    // chọn đề — đó là upsert từng phần, không phải ghi đè cả bản ghi.
    const session = await seedSession();
    await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

    await setReference(session.id, { modelAnswerNote: 'thêm sau' }).expect(200);

    const res = await readiness(session.id).expect(200);
    expect(res.body.hasQuestion).toBe(true);
    expect(res.body.hasModelAnswer).toBe(true);
  });

  it('chọn đề là tài liệu của PHIÊN KHÁC → 400', async () => {
    // Một id hợp lệ của phiên khác phải đọc là "không thuộc phiên này",
    // không phải là file của người khác được nạp vào prompt.
    const mine = await seedSession();
    const theirs = await seedSession();

    const res = await setReference(mine.id, { questionMaterialId: theirs.materialId });

    expect(res.status).toBe(400);
  });

  it('khoá lưu trữ đáp án mẫu do client tự bịa → 400', async () => {
    // Không có kiểm này thì client trỏ được bản ghi vào BẤT KỲ object nào
    // trong bucket — kể cả bài nộp của một sinh viên khác.
    const session = await seedSession();

    const res = await setReference(session.id, {
      modelAnswerStorageKey: 'submissions/ai-do/cua-ai-do/khoa-bia',
    });

    expect(res.status).toBe(400);
  });

  it('W1: gửi rõ null thì XOÁ, khác hẳn với bỏ trống', async () => {
    // Chọn nhầm file làm đề thì thay được — nhưng "thôi không dùng đề nữa"
    // cũng phải có đường. Gộp `undefined` và `null` làm một sẽ khiến giảng
    // viên đổi được lựa chọn mà không bỏ được.
    const session = await seedSession();
    await setReference(session.id, {
      questionMaterialId: session.materialId,
      modelAnswerNote: 'ghi chú',
    }).expect(200);
    expect((await readiness(session.id)).body.level).toBe('with_model_answer');

    await setReference(session.id, { questionMaterialId: null }).expect(200);

    const res = await readiness(session.id).expect(200);
    expect(res.body.hasQuestion).toBe(false);
    // Trường KHÔNG gửi vẫn giữ nguyên.
    expect(res.body.hasModelAnswer).toBe(true);
  });

  it('S1: xin URL upload đáp án mẫu sau khi đã chấm cũng bị chặn', async () => {
    // Guard đóng băng phải phủ MỌI đường ghi, không chỉ đường `upsert` —
    // nếu không thì upload được file mới đè lên file cũ mà không qua cửa nào.
    const session = await seedSession();
    await seedGradingResult(session);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/grading-reference/answer-key-upload`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(409);
  });

  it('W3: xoá file đang được chọn làm đề → 409 NÓI RÕ LÝ DO', async () => {
    // FK RESTRICT chặn được, nhưng PostgresExceptionFilter map 23503 thành
    // "This request conflicts with an existing record" — giảng viên không
    // có cách nào biết tại sao file của chính họ không xoá được.
    const session = await seedSession();
    await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

    const res = await request(app.getHttpServer())
      .delete(`/exam-sessions/${session.id}/materials/${session.materialId}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đề bài/i);
  });

  it('S5: không dòng exam_material nào mang khoá grading-reference/', async () => {
    // Chốt chặn CẤU TRÚC, bổ sung cho T-SEC-1: nếu một thay đổi tương lai
    // vô tình ghi bản ghi tài liệu chấm vào bảng exam_material thì test
    // này đỏ, kể cả khi nội dung đáp án không xuất hiện trong payload.
    const session = await seedSession();
    await setReference(session.id, {
      questionMaterialId: session.materialId,
      modelAnswerNote: 'bí mật',
    }).expect(200);

    const view = await materials.listForAgent(session.entity, new Date());

    expect(view.released).toBe(true);
    const keys = await dataSource.query(
      `SELECT storage_key FROM examcollect.exam_material WHERE exam_session_id = $1`,
      [session.id],
    );
    expect(
      keys.every((r: { storage_key: string }) => !r.storage_key.startsWith('grading-reference/')),
    ).toBe(true);
  });

  describe('cờ đáp án CHƯA KIỂM CHỨNG (từ agent soạn đề)', () => {
    async function flagOf(sessionId: string): Promise<boolean> {
      const [row] = await dataSource.query(
        `SELECT model_answer_unverified FROM examcollect.grading_reference
         WHERE exam_session_id = $1`,
        [sessionId],
      );
      return row.model_answer_unverified as boolean;
    }

    it('giảng viên tự upload thì cờ là false', async () => {
      const session = await seedSession();
      const res = await setReference(session.id, { modelAnswerNote: 'Chấp nhận cả quy hoạch động.' });
      expect(res.status).toBe(200);
      expect(await flagOf(session.id)).toBe(false);
    });

    it('gắn từ agent soạn đề thì cờ là true và LƯU LẠI được', async () => {
      // Chuẩn để chấm rút từ đáp án mẫu. Nếu nó chưa từng chạy, phiên phải
      // mang dấu — nếu không, mọi bài đều "lệch chuẩn" và không có tín hiệu
      // nào nói vấn đề nằm ở cái thước.
      const session = await seedSession();
      const res = await setReference(session.id, {
        modelAnswerNote: 'Đáp án do agent sinh.',
        modelAnswerUnverified: true,
      });
      expect(res.status).toBe(200);
      expect(await flagOf(session.id)).toBe(true);
    });

    it('thay bằng đáp án MỚI thì cờ được tính lại, không thừa kế bản cũ', async () => {
      // Một giảng viên thay đáp án chưa kiểm chứng bằng đáp án họ tự kiểm tay
      // mà vẫn thấy cảnh báo cũ thì họ sẽ học cách phớt lờ nó.
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'agent', modelAnswerUnverified: true });
      expect(await flagOf(session.id)).toBe(true);

      const upload = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/grading-reference/answer-key-upload`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(upload.status).toBe(200);

      // PUT THẬT lên kho: `upsert` từ chối một khoá mà object chưa tồn tại
      // ("chưa thấy file đáp án mẫu trên kho lưu trữ"), nên bỏ qua bước này
      // thì lượt ghi thứ hai bị 400 và test đo nhầm — cờ vẫn true, nhưng vì
      // bản ghi không đổi chứ không phải vì logic sai.
      const put = await fetch(upload.body.uploadUrl as string, {
        method: 'PUT',
        body: 'noi dung dap an mau',
      });
      expect(put.ok).toBe(true);

      const second = await setReference(session.id, {
        modelAnswerStorageKey: upload.body.storageKey,
      });
      expect(second.status).toBe(200);
      expect(await flagOf(session.id)).toBe(false);
    });

    it('sửa mỗi ghi chú thì cờ GIỮ NGUYÊN, không tự tắt', async () => {
      const session = await seedSession();
      await setReference(session.id, { modelAnswerNote: 'agent', modelAnswerUnverified: true });
      await setReference(session.id, { modelAnswerNote: 'agent, có sửa lời' });
      expect(await flagOf(session.id)).toBe(true);
    });
  });

  // G2b A2b: mã nguồn đáp án lưu theo BĂM nội dung. Khoá do server dựng và kiểm; client không tự đặt được.
  describe('mã nguồn đáp án (A2b)', () => {
    const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
    const keyFor = (sessionId: string, text: string, ext = 'cpp') => `grading-reference/${sessionId}/source-${sha(text)}.${ext}`;

    async function putSource(sessionId: string, text: string, ext = 'cpp') {
      const key = keyFor(sessionId, text, ext);
      await app.get(StorageService).putObject(key, Buffer.from(text, 'utf8'), 'text/plain; charset=utf-8');
      return { key, sha256: sha(text) };
    }

    async function sourceColumns(sessionId: string) {
      const [row] = await dataSource.query(
        `SELECT model_answer_source_key AS key, model_answer_source_sha256 AS sha256
           FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [sessionId],
      );
      return row as { key: string | null; sha256: string | null };
    }

    const upsert = (session: Seeded, dto: object, source: { key: string; sha256: string } | null) =>
      app.get(GradingReferenceService).upsert(session.entity, dto, teacherId, 'authoring', true, source);

    it('upsert với answerSource hợp lệ ghi cả hai cột', async () => {
      const session = await seedSession();
      const source = await putSource(session.id, 'int main() { return 0; }\n');
      await upsert(session, { modelAnswerNote: 'Đáp án' }, source);
      expect(await sourceColumns(session.id)).toEqual({ key: source.key, sha256: source.sha256 });
    });

    it('khoá mã nguồn sai khuôn (trỏ sang phiên khác) → BadRequestException, không ghi cột nào', async () => {
      const mine = await seedSession();
      const other = await seedSession();
      const foreign = await putSource(other.id, 'int main() { return 1; }\n');
      await expect(upsert(mine, { modelAnswerNote: 'x' }, foreign)).rejects.toBeInstanceOf(BadRequestException);
      const [row] = await dataSource.query(`SELECT 1 FROM examcollect.grading_reference WHERE exam_session_id = $1`, [mine.id]);
      expect(row).toBeUndefined();
    });

    it('băm khai báo khác băm trong khoá → BadRequestException', async () => {
      const session = await seedSession();
      const source = await putSource(session.id, 'print(1)\n', 'py');
      await expect(upsert(session, { modelAnswerNote: 'x' }, { key: source.key, sha256: sha('khac') })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('object chưa có trên kho → BadRequestException', async () => {
      const session = await seedSession();
      const key = keyFor(session.id, 'chua tung upload');
      await expect(upsert(session, { modelAnswerNote: 'x' }, { key, sha256: sha('chua tung upload') })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upsert kế tiếp gửi đáp án mới mà không kèm answerSource → cột mã nguồn về null', async () => {
      const session = await seedSession();
      const source = await putSource(session.id, 'int main() {}\n');
      await upsert(session, { modelAnswerNote: 'bản đầu' }, source);
      await upsert(session, { modelAnswerNote: 'bản sau, không có mã' }, null);
      expect(await sourceColumns(session.id)).toEqual({ key: null, sha256: null });
    });

    it('upsert không gửi đáp án (chỉ chọn lại đề) → giữ nguyên cột mã nguồn', async () => {
      const session = await seedSession();
      const source = await putSource(session.id, 'int main() { return 2; }\n');
      await upsert(session, { modelAnswerNote: 'có mã' }, source);
      await upsert(session, { questionMaterialId: session.materialId }, null);
      expect(await sourceColumns(session.id)).toEqual({ key: source.key, sha256: source.sha256 });
    });
  });

  // G2b-R Task 2: giảng viên đưa MÃ đáp án của mình lên bằng presigned URL (Security rule 5: không qua NestJS). Server chỉ
  // đọc object để băm, rồi đặt nó dưới khoá theo băm; khoá `pending-` là chỗ tạm và bị xoá.
  describe('tải mã đáp án của giảng viên (G2b-R Task 2)', () => {
    const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
    const post = (path: string, body: object, token = teacherToken) =>
      request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body);
    const uploadUrl = (sessionId: string, extension: string, token = teacherToken) =>
      post(`/exam-sessions/${sessionId}/grading-reference/answer-source/upload-url`, { extension }, token);
    const confirm = (sessionId: string, storageKey: string, token = teacherToken) =>
      post(`/exam-sessions/${sessionId}/grading-reference/answer-source/confirm`, { storageKey }, token);

    /** Xin URL, PUT thật lên kho như trình duyệt, trả khoá tạm. */
    async function uploadSource(sessionId: string, content: string | Buffer, extension = 'cpp'): Promise<string> {
      const res = await uploadUrl(sessionId, extension);
      expect(res.status).toBe(201);
      const put = await fetch(res.body.uploadUrl as string, {
        method: 'PUT',
        body: typeof content === 'string' ? content : new Uint8Array(content),
      });
      expect(put.ok).toBe(true);
      return res.body.storageKey as string;
    }

    async function referenceColumns(sessionId: string) {
      const [row] = await dataSource.query(
        `SELECT model_answer_source_key AS key, model_answer_source_sha256 AS sha256, model_answer_origin AS origin,
                model_answer_unverified AS unverified, ruler_trust
           FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [sessionId],
      );
      return row as { key: string | null; sha256: string | null; origin: string | null; unverified: boolean; ruler_trust: string | null };
    }

    it('upload-url trả khoá pending đúng tiền tố của phiên, kèm URL và hạn', async () => {
      const session = await seedSession();
      const res = await uploadUrl(session.id, 'cpp');

      expect(res.status).toBe(201);
      expect(res.body.storageKey).toMatch(new RegExp(`^grading-reference/${session.id}/pending-[0-9a-f-]{36}\\.cpp$`));
      expect(typeof res.body.uploadUrl).toBe('string');
      expect(res.body.expiresIn).toBeGreaterThan(0);
    });

    it('đuôi py được nhận; đuôi khác (java, rỗng, thiếu) → 400', async () => {
      const session = await seedSession();
      expect((await uploadUrl(session.id, 'py')).body.storageKey).toMatch(/\.py$/);
      for (const extension of ['java', '', 'CPP', '../x']) {
        expect((await uploadUrl(session.id, extension)).status).toBe(400);
      }
      expect((await post(`/exam-sessions/${session.id}/grading-reference/answer-source/upload-url`, {})).status).toBe(400);
    });

    it('confirm khi chưa upload gì → 400, không ghi cột nào', async () => {
      const session = await seedSession();
      const key = (await uploadUrl(session.id, 'cpp')).body.storageKey as string;

      expect((await confirm(session.id, key)).status).toBe(400);
      const [row] = await dataSource.query(`SELECT 1 FROM examcollect.grading_reference WHERE exam_session_id = $1`, [session.id]);
      expect(row).toBeUndefined();
    });

    it('confirm khoá của phiên khác → 400, dù object đã upload thật', async () => {
      const mine = await seedSession();
      const other = await seedSession();
      const foreignKey = await uploadSource(other.id, 'int main() {}\n');

      expect((await confirm(mine.id, foreignKey)).status).toBe(400);
    });

    it.each([
      ['khoá đáp án cố định', (id: string) => `grading-reference/${id}/answer-key`],
      ['khoá theo băm đã chốt', (id: string) => `grading-reference/${id}/source-${'a'.repeat(64)}.cpp`],
      ['khoá tài liệu của phiên', (id: string) => `materials/${id}/x`],
      ['khoá pending đuôi lạ', (id: string) => `grading-reference/${id}/pending-11111111-1111-4111-8111-111111111111.exe`],
      ['khoá có ..', (id: string) => `grading-reference/${id}/../x/pending-11111111-1111-4111-8111-111111111111.cpp`],
    ])('confirm với %s → 400 (chỉ nhận khoá pending của chính phiên này)', async (_label, keyOf) => {
      const session = await seedSession();
      expect((await confirm(session.id, keyOf(session.id))).status).toBe(400);
    });

    it('confirm đúng → cột nguồn đặt, băm khớp nội dung, origin teacher, chưa kiểm chứng; object theo băm có, object tạm bị xoá', async () => {
      const session = await seedSession();
      const code = '#include <iostream>\nint main() { std::cout << 7; }\n';
      const pendingKey = await uploadSource(session.id, code);

      const res = await confirm(session.id, pendingKey);

      expect(res.status).toBe(201);
      const finalKey = `grading-reference/${session.id}/source-${sha(code)}.cpp`;
      expect(res.body).toEqual({ sourceKey: finalKey, sha256: sha(code) });
      expect(await referenceColumns(session.id)).toEqual({
        key: finalKey,
        sha256: sha(code),
        origin: 'teacher',
        unverified: true,
        ruler_trust: 'unverified',
      });
      const storage = app.get(StorageService);
      expect((await storage.getObject(finalKey)).toString('utf8')).toBe(code);
      expect(await storage.objectExists(pendingKey)).toBe(false);
    });

    it('confirm hai lần cùng nội dung → cùng khoá, không lỗi (băm làm nó idempotent)', async () => {
      const session = await seedSession();
      const code = 'print(1)\n';
      const first = await confirm(session.id, await uploadSource(session.id, code, 'py'));
      const second = await confirm(session.id, await uploadSource(session.id, code, 'py'));

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.sourceKey).toBe(first.body.sourceKey);
    });

    it('đổi sang mã khác → cột trỏ bản mới, bản cũ còn trên kho', async () => {
      const session = await seedSession();
      const first = await confirm(session.id, await uploadSource(session.id, 'int a;\n'));
      const second = await confirm(session.id, await uploadSource(session.id, 'int b;\n'));

      expect((await referenceColumns(session.id)).key).toBe(second.body.sourceKey);
      expect(await app.get(StorageService).objectExists(first.body.sourceKey as string)).toBe(true);
    });

    it('xác nhận lại mã mới xoá xác nhận thước cũ: đáp án mới thì chưa ai xác nhận nó', async () => {
      const session = await seedSession();
      await confirm(session.id, await uploadSource(session.id, 'int a;\n'));
      expect((await post(`/exam-sessions/${session.id}/ruler/confirm`, {})).status).toBe(200);
      expect((await referenceColumns(session.id)).ruler_trust).toBe('teacher');

      await confirm(session.id, await uploadSource(session.id, 'int b;\n'));

      expect(await referenceColumns(session.id)).toMatchObject({ unverified: true, ruler_trust: 'unverified' });
      const [row] = await dataSource.query(
        `SELECT ruler_confirmed_by, ruler_confirmed_at FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [session.id],
      );
      expect(row).toEqual({ ruler_confirmed_by: null, ruler_confirmed_at: null });
    });

    it('object lớn hơn trần 256 KiB → 400, không ghi cột nào', async () => {
      const session = await seedSession();
      const pendingKey = await uploadSource(session.id, Buffer.alloc(256 * 1024 + 1, 'x'));

      expect((await confirm(session.id, pendingKey)).status).toBe(400);
      const [row] = await dataSource.query(`SELECT 1 FROM examcollect.grading_reference WHERE exam_session_id = $1`, [session.id]);
      expect(row).toBeUndefined();
    });

    it('phiên đã có bài đang chấm → 409 ở cả hai route', async () => {
      const session = await seedSession();
      const pendingKey = await uploadSource(session.id, 'int main() {}\n');
      await seedGradingResult(session);

      expect((await uploadUrl(session.id, 'cpp')).status).toBe(409);
      expect((await confirm(session.id, pendingKey)).status).toBe(409);
    });

    it('giảng viên không phải chủ phiên nhận 403 ở cả hai route', async () => {
      const session = await seedSession();
      expect((await uploadUrl(session.id, 'cpp', otherTeacherToken)).status).toBe(403);
      expect((await confirm(session.id, `grading-reference/${session.id}/pending-11111111-1111-4111-8111-111111111111.cpp`, otherTeacherToken)).status).toBe(403);
    });
  });

  // G2b-R Task 3: mã đáp án do HỆ THỐNG sinh (LLM viết rồi chạy trong sandbox). Độ tin cậy của thước do bước kiểm ví dụ
  // trong đề quyết định (`verified` khi khớp hết, `unverified` khi đề không có ví dụ), KHÔNG phải `teacher`.
  describe('mã đáp án do hệ thống sinh (G2b-R Task 3)', () => {
    const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

    async function generatedSource(sessionId: string, code: string) {
      const key = `grading-reference/${sessionId}/source-${sha(code)}.cpp`;
      await app.get(StorageService).putObject(key, Buffer.from(code, 'utf8'), 'text/plain; charset=utf-8');
      return { key, sha256: sha(code) };
    }
    const write = (session: Seeded, source: { key: string; sha256: string }, trust: 'verified' | 'unverified') =>
      dataSource.transaction((m) => app.get(GradingReferenceService).writeGeneratedSource(m, session.entity, teacherId, source, trust));
    async function row(sessionId: string) {
      const [r] = await dataSource.query(
        `SELECT model_answer_source_key AS key, model_answer_source_sha256 AS sha256, model_answer_origin AS origin,
                model_answer_unverified AS unverified, ruler_trust, ruler_confirmed_at
           FROM examcollect.grading_reference WHERE exam_session_id = $1`,
        [sessionId],
      );
      return r as { key: string | null; sha256: string | null; origin: string | null; unverified: boolean; ruler_trust: string | null; ruler_confirmed_at: Date | null };
    }

    it('unverified: origin generated, cờ chưa kiểm chứng bật, ruler_trust unverified, cột nguồn đặt', async () => {
      const session = await seedSession();
      const source = await generatedSource(session.id, 'int main() { return 0; }\n');

      await write(session, source, 'unverified');

      expect(await row(session.id)).toEqual({ key: source.key, sha256: source.sha256, origin: 'generated', unverified: true, ruler_trust: 'unverified', ruler_confirmed_at: null });
    });

    it('verified (ví dụ trong đề khớp hết): cờ chưa kiểm chứng tắt, ruler_trust verified, origin vẫn generated', async () => {
      const session = await seedSession();
      const source = await generatedSource(session.id, 'int main() { return 1; }\n');

      await write(session, source, 'verified');

      expect(await row(session.id)).toMatchObject({ origin: 'generated', unverified: false, ruler_trust: 'verified' });
    });

    it('lượt sinh sau xoá xác nhận thước cũ của giảng viên: đáp án mới thì chưa ai xác nhận nó', async () => {
      const session = await seedSession();
      await write(session, await generatedSource(session.id, 'int a;\n'), 'unverified');
      expect((await request(app.getHttpServer()).post(`/exam-sessions/${session.id}/ruler/confirm`).set('Authorization', `Bearer ${teacherToken}`)).status).toBe(200);
      expect((await row(session.id)).ruler_trust).toBe('teacher');

      await write(session, await generatedSource(session.id, 'int b;\n'), 'unverified');

      expect(await row(session.id)).toMatchObject({ unverified: true, ruler_trust: 'unverified', ruler_confirmed_at: null });
    });

    it('upsert chỉ chọn lại đề KHÔNG hạ verified xuống teacher; upsert gửi đáp án mới thì đưa về teacher và xoá cột nguồn', async () => {
      const session = await seedSession();
      await write(session, await generatedSource(session.id, 'int c;\n'), 'verified');

      expect((await setReference(session.id, { questionMaterialId: session.materialId })).status).toBe(200);
      expect(await row(session.id)).toMatchObject({ ruler_trust: 'verified', unverified: false });

      expect((await setReference(session.id, { modelAnswerNote: 'Đáp án giảng viên tự viết.' })).status).toBe(200);
      expect(await row(session.id)).toMatchObject({ ruler_trust: 'teacher', key: null, sha256: null });
    });

    it('khoá mã nguồn sai khuôn hay chưa có trên kho → BadRequestException, không ghi gì', async () => {
      const session = await seedSession();
      const other = await seedSession();
      const foreign = await generatedSource(other.id, 'int d;\n');
      await expect(write(session, foreign, 'verified')).rejects.toBeInstanceOf(BadRequestException);
      const missing = { key: `grading-reference/${session.id}/source-${sha('chua tung upload')}.cpp`, sha256: sha('chua tung upload') };
      await expect(write(session, missing, 'verified')).rejects.toBeInstanceOf(BadRequestException);
      const [exists] = await dataSource.query(`SELECT 1 FROM examcollect.grading_reference WHERE exam_session_id = $1`, [session.id]);
      expect(exists).toBeUndefined();
    });

    it('phiên đã có bài đang chấm → 409', async () => {
      const session = await seedSession();
      const source = await generatedSource(session.id, 'int e;\n');
      await seedGradingResult(session);
      await expect(write(session, source, 'verified')).rejects.toThrow(/đã chấm|đang chấm|Không sửa/i);
    });
  });

  it('giảng viên không phải chủ phiên nhận 403 ở cả hai route', async () => {
    const session = await seedSession();

    expect((await setReference(session.id, { modelAnswerNote: 'x' }, otherTeacherToken)).status)
      .toBe(403);
    expect((await readiness(session.id, otherTeacherToken)).status).toBe(403);
  });

  it('viết đáp án (ghi chú) -> model_answer_set_at có giá trị', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'chấp nhận cách A' }).expect(200);

    expect((await referenceRow(session.id)).model_answer_set_at).not.toBeNull();
  });

  // Review Focus #5 (nửa thứ nhất): chọn lại ĐỀ BÀI không phải là ghi đáp án,
  // nên dấu thời gian của đáp án đứng yên — đây là thứ `updated_at` không làm được.
  it('chỉ chọn lại đề bài -> model_answer_set_at đứng yên', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'A' }).expect(200);
    const before = await referenceRow(session.id);

    await pause(30);
    await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

    const after = await referenceRow(session.id);
    expect(after.model_answer_set_at!.getTime()).toBe(before.model_answer_set_at!.getTime());
  });

  // Review Focus #5 (nửa thứ hai): ghi chú LÀ một dạng đáp án.
  it('viết lại ghi chú -> model_answer_set_at đi tiếp', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'A' }).expect(200);
    const before = await referenceRow(session.id);

    await pause(30);
    await setReference(session.id, { modelAnswerNote: 'B' }).expect(200);

    const after = await referenceRow(session.id);
    expect(after.model_answer_set_at!.getTime()).toBeGreaterThan(before.model_answer_set_at!.getTime());
  });

  it('bỏ đáp án (gửi null) -> model_answer_set_at về NULL', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'sẽ bỏ' }).expect(200);

    await setReference(session.id, { modelAnswerNote: null }).expect(200);

    expect((await referenceRow(session.id)).model_answer_set_at).toBeNull();
  });

  it('sources: phiên chưa có tài liệu -> cả hai đều không có mặt', async () => {
    const session = await seedSession();

    const res = await readiness(session.id).expect(200);

    expect(res.body.sources.question).toEqual({ present: false, kind: 'teacher_upload', fileName: null, setAt: null });
    expect(res.body.sources.modelAnswer).toEqual({
      present: false,
      kind: 'teacher_upload',
      fileName: null,
      setAt: null,
      unverified: false,
    });
  });

  it('sources: đề giảng viên tải lên -> tên file và mốc tải lên', async () => {
    const session = await seedSession();
    await setReference(session.id, { questionMaterialId: session.materialId }).expect(200);

    const res = await readiness(session.id).expect(200);

    expect(res.body.sources.question).toEqual({
      present: true,
      kind: 'teacher_upload',
      fileName: 'DeThi.pdf',
      setAt: expect.any(String),
    });
  });

  it('sources: đáp án ghi tay -> tự khai, không có tên file, không mang cờ chưa kiểm chứng', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'chấp nhận cả quy hoạch động' }).expect(200);

    const res = await readiness(session.id).expect(200);

    expect(res.body.sources.modelAnswer).toEqual({
      present: true,
      kind: 'teacher_upload',
      fileName: null,
      setAt: expect.any(String),
      unverified: false,
    });
  });
});
