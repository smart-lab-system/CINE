import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
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

  /** Một dòng `grading_result` để kích hoạt luật đóng băng. */
  async function seedGradingResult(session: Seeded): Promise<void> {
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
    await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading')`,
      [submission.id, rubric.id, teacherId],
    );
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

  it('T-FREEZE-1: sửa tài liệu sau khi đã chấm trả 409', async () => {
    // Cùng luật với `setSessionRubric`: 20 bài đầu chấm có đáp án mẫu, 20
    // bài sau chấm với đáp án đã sửa, là hai kỳ thi khác nhau đội lốt một.
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'ghi chú ban đầu' }).expect(200);

    await seedGradingResult(session);

    const res = await setReference(session.id, { modelAnswerNote: 'đổi giữa chừng' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đã có kết quả chấm/i);
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

  it('giảng viên không phải chủ phiên nhận 403 ở cả hai route', async () => {
    const session = await seedSession();

    expect((await setReference(session.id, { modelAnswerNote: 'x' }, otherTeacherToken)).status)
      .toBe(403);
    expect((await readiness(session.id, otherTeacherToken)).status).toBe(403);
  });
});
