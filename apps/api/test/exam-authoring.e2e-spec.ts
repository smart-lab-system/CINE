import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { PostgresExceptionFilter } from "../src/common/postgres-exception.filter";
import { createTestAccount } from "./helpers/create-account";

/**
 * Agent soạn đề — route `generate`, và cái bảng `ai_usage` đi kèm.
 *
 * `NODE_ENV=test` nên provider là stub (xem `selectAuthoringProvider`): không
 * tốn tiền, đầu ra tất định. Nếu một ngày nào đó test ở đây bắt đầu chậm hoặc
 * cho ra đề khác nhau mỗi lần chạy, nghĩa là guard đó đã hỏng và cả bộ e2e
 * đang gọi API thật.
 */
describe("Exam authoring (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let adminToken: string;

  const PASSWORD = "correct-horse-battery";

  async function makeAccount(prefix: string, role: "teacher" | "admin") {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, {
      email,
      password: PASSWORD,
      role,
    });
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  function generate(body: Record<string, unknown>, token = teacherToken) {
    return request(app.getHttpServer())
      .post("/exam-authoring/generate")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function usageCount(): Promise<number> {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.ai_usage WHERE teacher_id = $1`,
      [teacherId],
    );
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const teacher = await makeAccount("authoring_gv", "teacher");
    teacherId = teacher.id;
    teacherToken = teacher.token;
    adminToken = (await makeAccount("authoring_admin", "admin")).token;
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM examcollect.ai_usage WHERE teacher_id = $1`,
      [teacherId],
    );
    await app.close();
  });

  it("teacher sinh được đề, và đề LUÔN unverified", async () => {
    const res = await generate({
      prompt: "sắp xếp và tìm kiếm nhị phân",
      questionCount: 2,
      language: "python",
    });

    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(2);
    // Không có sandbox thì không có trạng thái nào khác. Nếu ca này chuyển
    // sang 'passed' mà chưa ai dựng sandbox, nghĩa là parser đã bắt đầu tin
    // lời model tự khai.
    expect(res.body.verification).toEqual({
      status: "unverified",
      reason: "sandbox_unavailable",
    });
  });

  it("ghi ĐÚNG MỘT dòng ai_usage, và dòng đó KHÔNG chứa nội dung đề", async () => {
    const before = await usageCount();
    await generate({
      prompt: "cây nhị phân tìm kiếm",
      questionCount: 1,
      language: "python",
    });

    const rows = await dataSource.query(
      `SELECT * FROM examcollect.ai_usage WHERE teacher_id = $1 ORDER BY created_at DESC`,
      [teacherId],
    );
    expect(rows.length).toBe(before + 1);
    expect(rows[0].question_count).toBe(1);
    expect(rows[0].feature).toBe("exam_authoring");
    // Spec §9.1: usage CÓ, content KHÔNG. So cả hàng với một chuỗi chắc chắn
    // nằm trong đáp án mẫu của stub.
    expect(JSON.stringify(rows[0])).not.toContain("def solve");
  });

  it("sinh lại một câu ghi một dòng ai_usage RIÊNG với question_count = 1", async () => {
    const before = await usageCount();
    const res = await generate({
      prompt: "sắp xếp và tìm kiếm nhị phân",
      questionCount: 1,
      language: "python",
      avoid: ["tìm kiếm nhị phân tìm biên trái"],
      refineNote: "đổi sang đếm số lần so sánh",
      existingStatements: ["Sắp xếp mảng tăng dần."],
    });

    expect(res.status).toBe(201);
    const rows = await dataSource.query(
      `SELECT question_count FROM examcollect.ai_usage WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacherId],
    );
    // Một lời gọi model tốn tiền thật. Gộp vào lượt gốc thì con số "soạn một
    // đề tốn bao nhiêu" nói dối theo hướng rẻ đi.
    expect(rows.length).toBe(before + 1);
    expect(rows[0].question_count).toBe(1);
  });

  it("questionCount vượt 10 bị từ chối 400", async () => {
    const res = await generate({
      prompt: "x".repeat(20),
      questionCount: 11,
      language: "python",
    });
    expect(res.status).toBe(400);
  });

  it("ngôn ngữ ngoài danh sách bị từ chối 400", async () => {
    const res = await generate({
      prompt: "x".repeat(20),
      questionCount: 1,
      language: "brainfuck",
    });
    expect(res.status).toBe(400);
  });

  it("prompt quá ngắn bị từ chối 400 — một chữ không đủ để soạn đề", async () => {
    const res = await generate({
      prompt: "x",
      questionCount: 1,
      language: "python",
    });
    expect(res.status).toBe(400);
  });

  it("admin KHÔNG soạn được đề — 403", async () => {
    const res = await generate(
      { prompt: "x".repeat(20), questionCount: 1, language: "python" },
      adminToken,
    );
    expect(res.status).toBe(403);
  });

  describe("xuất Word — luật HAI FILE", () => {
    function exportPaper(examJson: string, token = teacherToken) {
      return request(app.getHttpServer())
        .post("/exam-authoring/export/paper")
        .set("Authorization", `Bearer ${token}`)
        .send({ examJson });
    }

    function exportKey(examJson: string, token = teacherToken) {
      return request(app.getHttpServer())
        .post("/exam-authoring/export/answer-key")
        .set("Authorization", `Bearer ${token}`)
        .send({ examJson });
    }

    it("đề và đáp án là HAI endpoint, HAI file khác nhau", async () => {
      const gen = await generate({
        prompt: "sắp xếp mảng số nguyên",
        questionCount: 1,
        language: "python",
      });
      const examJson = JSON.stringify(gen.body);

      const paper = await exportPaper(examJson);
      expect(paper.status).toBe(201);
      expect(paper.headers["content-disposition"]).toContain("de-thi.docx");

      const key = await exportKey(examJson);
      expect(key.status).toBe(201);
      expect(key.headers["content-disposition"]).toContain(
        "dap-an-va-test.docx",
      );

      // So bằng `content-length` chứ không bằng `body`: supertest không có
      // parser cho MIME của docx nên `body` về là `{}`, và `Buffer.from({})`
      // ném — một test đỏ vì lý do không liên quan gì tới thứ đang kiểm.
      const paperSize = Number(paper.headers["content-length"]);
      const keySize = Number(key.headers["content-length"]);
      expect(paperSize).toBeGreaterThan(0);
      // Đáp án dài hơn đề: nó mang thêm mã nguồn và bảng ca test. Nếu ai đó
      // gộp hai tài liệu lại thì hai số này bằng nhau và dòng dưới đỏ.
      expect(keySize).toBeGreaterThan(paperSize);
    });

    it("examJson hỏng thì 400, không trả về một file Word rỗng", async () => {
      expect((await exportPaper("{ khong phai json")).status).toBe(400);
    });

    it("admin KHÔNG xuất được đề — 403", async () => {
      const gen = await generate({
        prompt: "sắp xếp mảng số nguyên",
        questionCount: 1,
        language: "python",
      });
      expect(
        (await exportPaper(JSON.stringify(gen.body), adminToken)).status,
      ).toBe(403);
    });
  });

  it("không có token thì 401", async () => {
    const res = await request(app.getHttpServer())
      .post("/exam-authoring/generate")
      .send({ prompt: "x".repeat(20), questionCount: 1, language: "python" });
    expect(res.status).toBe(401);
  });

  /**
   * Trần 24 giờ, đi qua HTTP thật.
   *
   * Giảng viên RIÊNG và gieo thẳng vào `ai_usage`: gọi đủ 60 lượt cho chạm
   * trần sẽ biến bài test thành một vòng lặp dài vô ích, trong khi thứ cần
   * chứng minh chỉ là "route đọc đúng bảng đó và trả 429". Lớp cửa sổ trượt
   * có bộ test riêng ở `generate-quota.service.spec.ts`.
   */
  it("hết hạn mức 24 giờ -> 429, và KHÔNG gọi tới model", async () => {
    const quotaTeacher = await makeAccount("authoring_quota", "teacher");
    const rows = Array.from(
      { length: 60 },
      () =>
        `('${quotaTeacher.id}', 'exam_authoring', 'stub', 1, 1, 1, 'unverified')`,
    ).join(",");
    await dataSource.query(
      `INSERT INTO examcollect.ai_usage
         (teacher_id, feature, model_used, input_tokens, output_tokens, question_count, verification_status)
       VALUES ${rows}`,
    );

    const res = await generate(
      { prompt: "cây nhị phân tìm kiếm", questionCount: 1, language: "python" },
      quotaTeacher.token,
    );

    expect(res.status).toBe(429);
    expect(res.body.message).toContain("24 giờ");
    // Chặn phải xảy ra TRƯỚC lời gọi model: nếu nó chạy rồi mới chặn thì bảng
    // usage có dòng thứ 61, và tiền đã tiêu xong trước khi hạn mức lên tiếng.
    const [after] = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.ai_usage WHERE teacher_id = $1`,
      [quotaTeacher.id],
    );
    expect(after.n).toBe(60);

    await dataSource.query(
      `DELETE FROM examcollect.ai_usage WHERE teacher_id = $1`,
      [quotaTeacher.id],
    );
  });
});
