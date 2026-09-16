# Giao diện chấm điểm — đợt 0→3 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở khoá bốn route chấm điểm chưa có UI, để lượt phản biện (Advocate) chạy thật lần đầu tiên, và dựng ba màn hình cho giảng viên duyệt 45 bài.

**Architecture:** Backend thêm đúng bốn thứ (hai trường vào view, một hàm định vị dẫn chứng, một route trả toạ độ, một migration ghi chú). Web dựng ba màn trên hệ token sẵn có. **Client không bao giờ so chuỗi** — server định vị dẫn chứng bằng chính hàm đã dùng lúc chấm và trả về toạ độ.

**Tech Stack:** NestJS 10 + TypeORM + Postgres (`apps/api`, jest) · Next.js 15 App Router + React 19 + TanStack Query + Tailwind (`apps/web`, vitest) · `packages/shared` cho type OpenAPI sinh tự động.

**Spec:** `docs/superpowers/specs/2026-09-16-grading-ui-design.md` (rev 2)

## Global Constraints

- **Nhánh nền:** `feature/grading-pipeline-hardening`. Tạo nhánh `feature/grading-ui-waves-0-3` từ đó.
- **`ai_total_score`, `criterion_results`, `advocate_opinion`, `context_used_*` chỉ ĐỌC từ phía UI.** Mọi sửa của giảng viên tạo dòng `teacher_review` mới (Security rule 6, ép bằng trigger `guard_grading_result_ai_immutable`).
- **Đáp án mẫu không bao giờ hiển thị trên UI chấm.** Prefix `grading-reference/` tách hẳn khỏi `materials/`.
- **Chọn đề bài luôn tường minh**, không đoán theo tên file (Security rule 9).
- **Chữ trên màn hình dùng ngôn ngữ khảo thí**, không dùng thuật ngữ nội bộ. Bảng quy đổi bắt buộc ở spec §3.2: Advocate → *lượt phản biện*; Grader → *lượt chấm*; guard G2 → *đối chiếu từng chữ*; `rubric_only`/`with_question`/`with_model_answer` → *Mức 1/2/3*; `confidence` → *độ tin cậy*; `flagged_for_review` → *cần bạn duyệt*.
- **Màu/chữ/bo góc lấy từ token sẵn có.** Không thêm giá trị literal: mọi màu qua `hsl(var(--x))` hoặc class Tailwind đã map. Font là Inter (`--font-sans`), không thêm họ chữ thứ hai.
- **Nút:** mặc định teal (`variant="default"`), indigo (`variant="primary"`) chỉ cho hành động mang tính thương hiệu. Không có nút xám đặc.
- **Badge:** dùng `<Badge variant="...">` sẵn có, không tự vẽ pill.
- **File `< 500` dòng.** Vượt thì tách sang `_components/`.
- **`pnpm check:cycles` phải in `0`.**
- **Sau mỗi task:** `npx tsc --noEmit` ở app tương ứng, chạy test của task, rồi commit.
- **Ba chi tiết đã sai trong bản nháp plan, sửa khi thực thi:** script dev của API là
  `pnpm dev`, không phải `pnpm start:dev` · e2e xác thực bằng
  `Authorization: Bearer`, không phải cookie · repo **không có**
  `@testing-library/user-event`, dùng `fireEvent` theo nếp sẵn có thay vì
  thêm dependency.
- **Lỗi tsc CÓ SẴN trên nhánh nền:** `apps/web/src/lib/read-workbook.test.ts` có 2
  lỗi `File` của buffer vs `File` của DOM. Đã xác minh bằng `git stash`. Không
  thuộc phạm vi plan này; đừng tưởng mình vừa làm hỏng.

---

# ĐỢT 0 — Mở khoá backend

## Task 1: `locateEvidence()` — định vị dẫn chứng, trả toạ độ

**Files:**
- Modify: `apps/api/src/grading/harness/evidence-check.ts`
- Test: `apps/api/src/grading/harness/evidence-check.spec.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`, `MIN_EVIDENCE_CHARS` (đã có trong cùng file)
- Produces:
  ```ts
  export interface EvidenceSpan { start: number; end: number }  // offset trong chuỗi NFC
  export interface EvidenceLocation { check: EvidenceCheck; spans: EvidenceSpan[] }
  export function locateEvidence(
    studentText: string,
    evidence: string,
    opts?: { spans?: boolean },
  ): EvidenceLocation
  ```

**Vì sao task này đi trước tất cả:** toàn bộ màn Bàn chấm treo vào nó, và nó là hàm thuần — test được trong mili giây, không cần dựng Nest.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `apps/api/src/grading/harness/evidence-check.spec.ts`:

```ts
import { locateEvidence, verifyEvidence } from './evidence-check';

describe('locateEvidence', () => {
  const TEXT = 'Ưu điểm lớn nhất là khả năng mở rộng từng phần.\n\nNhược điểm là dữ liệu bị phân mảnh giữa các dịch vụ.';

  it('trả span trỏ đúng đoạn trong chuỗi gốc', () => {
    const got = locateEvidence(TEXT, 'khả năng mở rộng từng phần', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(1);
    expect(TEXT.slice(got.spans[0].start, got.spans[0].end)).toBe('khả năng mở rộng từng phần');
  });

  it('định vị được trích dẫn VẮT QUA ranh giới đoạn', () => {
    // Đây là ca mà mọi cách chẻ đoạn ở client sẽ trượt: normalizeForMatch
    // gộp '\n\n' thành một dấu cách, nên chuỗi này là hợp lệ với server.
    const got = locateEvidence(TEXT, 'từng phần. Nhược điểm là dữ liệu', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(1);
    expect(TEXT.slice(got.spans[0].start, got.spans[0].end)).toContain('Nhược điểm');
  });

  it('trả một span cho mỗi mẩu của trích dẫn rút gọn bằng elision', () => {
    const got = locateEvidence(TEXT, 'Ưu điểm lớn nhất … dữ liệu bị phân mảnh', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(2);
    expect(got.spans[0].end).toBeLessThanOrEqual(got.spans[1].start);
  });

  it('không định vị được thì trả unverified và không span nào', () => {
    const got = locateEvidence(TEXT, 'một hệ thống giám sát tập trung', { spans: true });
    expect(got.check).toBe('unverified');
    expect(got.spans).toEqual([]);
  });

  it('trích dẫn rỗng là empty, không phải unverified', () => {
    expect(locateEvidence(TEXT, '   ', { spans: true }).check).toBe('empty');
  });

  it('bỏ span thì không dựng bảng ánh xạ', () => {
    const got = locateEvidence(TEXT, 'khả năng mở rộng từng phần');
    expect(got.check).toBe('ok');
    expect(got.spans).toEqual([]);
  });
});

describe('locateEvidence và verifyEvidence không bao giờ bất đồng', () => {
  const TEXT = 'Sinh viên viết một câu dài đủ để vượt ngưỡng mười ký tự, rồi thêm một câu nữa.';
  const CASES = [
    'một câu dài đủ để vượt ngưỡng',
    'câu không hề có trong bài làm này',
    '',
    'ngắn',
    'Sinh viên viết … thêm một câu nữa',
    'thêm một câu nữa … Sinh viên viết', // sai thứ tự -> unverified
  ];

  it.each(CASES)('cho cùng một verdict với %p', (evidence) => {
    expect(locateEvidence(TEXT, evidence, { spans: true }).check).toBe(
      verifyEvidence(TEXT, evidence),
    );
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest src/grading/harness/evidence-check.spec.ts`
Expected: FAIL — `locateEvidence is not a function`

- [ ] **Step 3: Cài đặt**

Thêm vào `apps/api/src/grading/harness/evidence-check.ts`, **sau** `normalizeForMatch` và `splitElision`:

```ts
/** Vị trí một mẩu dẫn chứng trong bài làm, theo toạ độ chuỗi ĐÃ NFC. */
export interface EvidenceSpan {
  start: number;
  /** Loại trừ, như `String.prototype.slice`. */
  end: number;
}

export interface EvidenceLocation {
  check: EvidenceCheck;
  /** Một span mỗi mẩu elision, theo thứ tự. Rỗng khi `check !== 'ok'`. */
  spans: EvidenceSpan[];
}

/**
 * Chuẩn hoá KÈM bảng ánh xạ ngược về chuỗi gốc.
 *
 * `normalizeForMatch` dùng regex và không giữ được vị trí — đủ cho câu hỏi
 * "có hay không", không đủ cho câu hỏi "ở đâu". Vòng lặp này làm cùng một
 * phép biến đổi, từng ký tự một, và ghi lại ký tự gốc nào sinh ra ký tự
 * chuẩn hoá nào.
 *
 * NFC chạy TRƯỚC và kết quả của nó là hệ toạ độ mà span nói tới — gọi hàm
 * này rồi trả offset về một chuỗi CHƯA NFC là cách chắc chắn nhất để lệch
 * vài ký tự trên đúng những bài có dấu tiếng Việt tổ hợp.
 */
function normalizeWithMap(nfc: string): { text: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < nfc.length; i += 1) {
    const ch = nfc[i];

    if (/\s/.test(ch)) {
      // Gộp cả một dải khoảng trắng thành MỘT dấu cách — kể cả '\n\n'.
      // Đây chính là lý do một trích dẫn vắt qua hai đoạn vẫn khớp.
      pendingSpace = true;
      continue;
    }
    if (ZERO_WIDTH.test(ch)) {
      continue;
    }

    if (pendingSpace) {
      pendingSpace = false;
      if (out.length > 0) {
        // Không phát dấu cách ở đầu chuỗi — tương đương `.trim()`.
        out.push(' ');
        map.push(i);
      }
    }

    const folded = foldChar(ch).toLowerCase();
    for (const piece of folded) {
      out.push(piece);
      map.push(i);
    }
  }

  return { text: out.join(''), map };
}

/** Zero-width: bị xoá hẳn, không thành dấu cách. */
const ZERO_WIDTH = /[​-‍﻿]/;

/** Một ký tự qua bảng gấp kiểu chữ in. Trả về chuỗi vì có ca 1→0. */
function foldChar(ch: string): string {
  for (const [re, to] of TYPOGRAPHIC_FOLD) {
    // `re` có cờ `g`; tạo bản không trạng thái để `test` không nhớ lastIndex.
    if (new RegExp(re.source).test(ch)) {
      return to;
    }
  }
  return ch;
}

/**
 * Dẫn chứng nằm Ở ĐÂU trong bài làm.
 *
 * `check` LUÔN bằng `verifyEvidence(studentText, evidence)` — có test khoá
 * điều đó. Khác biệt duy nhất là hàm này còn trả vị trí, và chỉ dựng bảng
 * ánh xạ khi được yêu cầu: đường chấm gọi nó cho mọi tiêu chí của mọi bài
 * và không cần vị trí, nên nó không phải trả giá cho một mảng n phần tử.
 */
export function locateEvidence(
  studentText: string,
  evidence: string,
  opts?: { spans?: boolean },
): EvidenceLocation {
  if (evidence.trim() === '') {
    return { check: 'empty', spans: [] };
  }

  const parts = splitElision(evidence);
  if (parts.length === 0) {
    return { check: 'unverified', spans: [] };
  }

  const wantSpans = opts?.spans === true;
  const nfc = studentText.normalize('NFC');
  const mapped = wantSpans ? normalizeWithMap(nfc) : null;
  const haystack = mapped ? mapped.text : normalizeForMatch(studentText);

  const spans: EvidenceSpan[] = [];
  let cursor = 0;
  for (const part of parts) {
    if (part.length < MIN_EVIDENCE_CHARS) {
      return { check: 'unverified', spans: [] };
    }
    const at = haystack.indexOf(part, cursor);
    if (at === -1) {
      return { check: 'unverified', spans: [] };
    }
    if (mapped) {
      spans.push({
        start: mapped.map[at],
        // Cuối = vị trí gốc của ký tự khớp CUỐI CÙNG, cộng một.
        end: mapped.map[at + part.length - 1] + 1,
      });
    }
    cursor = at + part.length;
  }

  return { check: 'ok', spans };
}
```

Rồi **thay thân** `verifyEvidence` để chỉ còn một cài đặt duy nhất:

```ts
export function verifyEvidence(studentText: string, evidence: string): EvidenceCheck {
  // Một cài đặt, hai câu hỏi. Hai thân hàm là hai thứ sẽ trôi khỏi nhau,
  // và triệu chứng sẽ là UI báo "không tìm thấy" cho câu guard đã chấm ok.
  return locateEvidence(studentText, evidence).check;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó XANH, và không làm đỏ test cũ**

Run: `cd apps/api && npx jest src/grading/harness/`
Expected: PASS — toàn bộ, gồm cả các test cũ của `verifyEvidence`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/harness/evidence-check.ts apps/api/src/grading/harness/evidence-check.spec.ts
git commit -m "feat(grading): locateEvidence trả toạ độ dẫn chứng, verifyEvidence uỷ quyền cho nó"
```

---

## Task 2: Trả `advocateOpinion` và `contextUsed*` ra view

**Files:**
- Modify: `apps/api/src/grading/grading.service.ts` (interface `GradingResultView` + `listForSession`)
- Test: `apps/api/test/grading-results-view.e2e-spec.ts` (tạo mới)

**Interfaces:**
- Produces: `GradingResultView` có thêm
  ```ts
  advocateOpinion: AdvocateOpinion | null;
  contextUsedQuestion: boolean | null;
  contextUsedModelAnswer: boolean | null;
  ```

**Ràng buộc:** đây là đường **ĐỌC**. Không đụng bất kỳ `update()` nào — trigger bất biến đóng băng các cột này ngay khi `ai_total_score` được ghi.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/test/grading-results-view.e2e-spec.ts`. Dựng theo đúng khuôn của `department-class-counts.e2e-spec.ts` (dùng `GRADING_PATHS` để đi hết chuỗi trạng thái — trigger không cho `INSERT` thẳng vào `flagged_for_review`):

```ts
it('trả advocate_opinion và context_used_* cho giảng viên sở hữu phiên', async () => {
  // ... dựng phiên + bài nộp + grading_result, đi hết chuỗi trạng thái,
  // rồi UPDATE advocate_opinion + context_used_* trong CÙNG update với
  // ai_total_score (trigger đóng băng chúng ngay sau đó).
  const res = await request(app.getHttpServer())
    .get(`/exam-sessions/${sessionId}/grading-results`)
    .set('Cookie', teacherCookie)
    .expect(200);

  const row = res.body[0];
  expect(row.contextUsedQuestion).toBe(true);
  expect(row.contextUsedModelAnswer).toBe(false);
  expect(row.advocateOpinion).toMatchObject({
    isCorrect: 'yes',
    suggestedVerdicts: [{ criterionId: expect.any(String), suggestedVerdict: 'met' }],
  });
});

it('phân biệt "chưa chạy lượt phản biện" với "đã chạy và không có ý kiến"', async () => {
  // Bài không kích hoạt cổng advocate.
  const res = await request(app.getHttpServer())
    .get(`/exam-sessions/${otherSessionId}/grading-results`)
    .set('Cookie', teacherCookie)
    .expect(200);

  // null, KHÔNG phải {} — hai thứ đó đọc ra khác nhau trên màn hình.
  expect(res.body[0].advocateOpinion).toBeNull();
  expect(res.body[0].contextUsedQuestion).toBeNull();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest --config test/jest-e2e.json grading-results-view`
Expected: FAIL — `expect(received).toBe(true)` nhận `undefined`

- [ ] **Step 3: Cài đặt**

Trong `apps/api/src/grading/grading.service.ts`, thêm vào `interface GradingResultView`, ngay sau `criterionResults`:

```ts
  /**
   * Ý kiến lượt phản biện. `null` nghĩa là cổng KHÔNG kích hoạt (không có
   * tiêu chí `not_met`, hoặc phiên chưa có đề bài) — khác hẳn "đã chạy và
   * không bênh được gì". Màn hình phải nói ra khác biệt đó.
   */
  advocateOpinion: AdvocateOpinion | null;
  /** `null` = chấm trước khi hệ thống ghi lại điều này. Khác `false`. */
  contextUsedQuestion: boolean | null;
  contextUsedModelAnswer: boolean | null;
```

và thêm import ở đầu file:

```ts
import type { AdvocateOpinion } from './ai-provider/advocate.types';
```

Trong `listForSession()`, thêm vào object trả về của `rows.entities.map(...)`, ngay sau `criterionResults: entity.criterionResults,`:

```ts
        advocateOpinion: entity.advocateOpinion,
        contextUsedQuestion: entity.contextUsedQuestion,
        contextUsedModelAnswer: entity.contextUsedModelAnswer,
```

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/api && npx jest --config test/jest-e2e.json grading-results-view`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/grading.service.ts apps/api/test/grading-results-view.e2e-spec.ts
git commit -m "feat(grading): view trả advocate_opinion và context_used_* — trước đó UI không đọc được"
```

---

## Task 3: `GET /grading-results/:id/submission-text` — trả toạ độ, không trả chuỗi thô

**Files:**
- Create: `apps/api/src/grading/submission-text.service.ts`
- Create: `apps/api/src/grading/submission-text.service.spec.ts`
- Modify: `apps/api/src/grading/grading.controller.ts`
- Modify: `apps/api/src/grading/grading.module.ts` (đăng ký provider)
- Test: `apps/api/test/submission-text.e2e-spec.ts`

**Interfaces:**
- Consumes: `locateEvidence` (Task 1), `ContentResolverRegistry`, `StorageService`, `GradingService.findOwnedResult`
- Produces:
  ```ts
  export interface SubmissionTextSpan {
    criterionId: string;
    paragraph: number;   // chỉ số trong `paragraphs`
    start: number;       // offset trong ĐÚNG đoạn đó
    end: number;
  }
  export interface SubmissionTextView {
    paragraphs: string[];
    spans: SubmissionTextSpan[];
    unlocatable: string[];        // criterionId
    truncatedByGrading: boolean;
  }
  ```

- [ ] **Step 1: Viết test thất bại cho phần thuần**

Tạo `apps/api/src/grading/submission-text.service.spec.ts`. Chỉ test hai hàm thuần được export cạnh service:

```ts
import { splitParagraphs, toParagraphSpans } from './submission-text.service';

describe('splitParagraphs', () => {
  it('giữ offset gốc của từng đoạn', () => {
    const got = splitParagraphs('Đoạn một.\n\nĐoạn hai.');
    expect(got).toEqual([
      { text: 'Đoạn một.', start: 0, end: 9 },
      { text: 'Đoạn hai.', start: 11, end: 20 },
    ]);
  });

  it('một đoạn duy nhất khi không có dòng trống', () => {
    const got = splitParagraphs('Một dòng\nxuống dòng mềm');
    expect(got).toHaveLength(1);
  });
});

describe('toParagraphSpans', () => {
  const paras = splitParagraphs('Đoạn một.\n\nĐoạn hai.');

  it('quy span toàn cục về offset trong đoạn', () => {
    // 'một' nằm ở offset 5..8 của chuỗi gốc, tức 5..8 của đoạn 0.
    expect(toParagraphSpans(paras, 'c1', [{ start: 5, end: 8 }])).toEqual([
      { criterionId: 'c1', paragraph: 0, start: 5, end: 8 },
    ]);
  });

  it('CHẺ ĐÔI span vắt qua hai đoạn, giữ nguyên criterionId', () => {
    // 5..15 phủ cuối đoạn 0 và đầu đoạn 1.
    const got = toParagraphSpans(paras, 'c2', [{ start: 5, end: 15 }]);
    expect(got).toEqual([
      { criterionId: 'c2', paragraph: 0, start: 5, end: 9 },
      { criterionId: 'c2', paragraph: 1, start: 0, end: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest src/grading/submission-text.service.spec.ts`
Expected: FAIL — `Cannot find module './submission-text.service'`

- [ ] **Step 3: Cài đặt service**

Tạo `apps/api/src/grading/submission-text.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { StorageService } from '../storage/storage.service';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { GradingResultEntity } from './entities/grading-result.entity';
import { locateEvidence, type EvidenceSpan } from './harness/evidence-check';
import { TRUNCATION_NOTICE } from './grading.types';

export interface SubmissionTextSpan {
  criterionId: string;
  paragraph: number;
  start: number;
  end: number;
}

export interface SubmissionTextView {
  paragraphs: string[];
  spans: SubmissionTextSpan[];
  /** Tiêu chí có dẫn chứng nhưng không định vị được — khớp `check: 'unverified'`. */
  unlocatable: string[];
  /** Bài đã bị cắt LÚC CHẤM. Phần sau đó model chưa bao giờ đọc. */
  truncatedByGrading: boolean;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
}

/**
 * Chẻ đoạn mà GIỮ offset gốc.
 *
 * `split()` thường vứt mất vị trí, và vị trí là toàn bộ thứ task này cần.
 * Ranh giới là một dòng trống trở lên — đúng thứ `mammoth.extractRawText`
 * sinh ra giữa hai paragraph của Word.
 */
export function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const re = /\n{2,}/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: text.slice(at, m.index), start: at, end: m.index });
    at = m.index + m[0].length;
  }
  out.push({ text: text.slice(at), start: at, end: text.length });
  return out;
}

/**
 * Quy span toàn cục về offset trong từng đoạn.
 *
 * Một span vắt qua ranh giới đoạn ra NHIỀU span cùng `criterionId`. Đó là
 * ca thường, không phải ca biên: phép chuẩn hoá gộp '\n\n' thành một dấu
 * cách, nên model trích một câu qua hai đoạn là hoàn toàn hợp lệ.
 */
export function toParagraphSpans(
  paragraphs: Paragraph[],
  criterionId: string,
  spans: EvidenceSpan[],
): SubmissionTextSpan[] {
  const out: SubmissionTextSpan[] = [];
  for (const span of spans) {
    paragraphs.forEach((p, index) => {
      const start = Math.max(span.start, p.start);
      const end = Math.min(span.end, p.end);
      if (start >= end) return;
      out.push({ criterionId, paragraph: index, start: start - p.start, end: end - p.start });
    });
  }
  return out;
}

@Injectable()
export class SubmissionTextService {
  private readonly logger = new Logger(SubmissionTextService.name);

  constructor(
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    private readonly storage: StorageService,
    private readonly resolvers: ContentResolverRegistry,
  ) {}

  /**
   * Bài làm, kèm vị trí mọi dẫn chứng AI đã trích.
   *
   * Định vị chạy Ở ĐÂY, không ở client. `normalizeForMatch` đối chiếu trên
   * cả bài đã làm phẳng, nên chỉ phía nào cầm nguyên chuỗi đó mới định vị
   * đúng được. Client chẻ đoạn rồi tự so sẽ trượt đúng những trích dẫn vắt
   * đoạn, và hiện ra "không tìm thấy" cho câu guard đã chấm `ok`.
   */
  async forResult(result: GradingResultEntity): Promise<SubmissionTextView> {
    const submission = await this.submissions.findOneOrFail({
      where: { id: result.submissionId },
    });
    const deliverable = await this.deliverables.findOneOrFail({
      where: { id: submission.requiredDeliverableId },
    });

    let text = '';
    try {
      if (submission.storageKey) {
        const bytes = await this.storage.getObject(submission.storageKey);
        const resolved = await this.resolvers
          .for(deliverable.deliverableType)
          .resolve(bytes, deliverable.requiredFilename);
        text = resolved.text;
      }
    } catch (error) {
      // Cùng cách xử lý với `gradeOne`: không đọc được là sự thật về việc
      // trích xuất, không phải phán xét về bài làm. Trả rỗng để màn hình
      // nói "định dạng này chưa đọc được", thay vì ném 500.
      this.logger.warn(
        `submission ${submission.id}: không đọc được nội dung — ${(error as Error).message}`,
      );
    }

    const nfc = text.normalize('NFC');
    const paragraphs = splitParagraphs(nfc);

    const spans: SubmissionTextSpan[] = [];
    const unlocatable: string[] = [];
    for (const criterion of result.criterionResults ?? []) {
      const found = locateEvidence(nfc, criterion.evidence ?? '', { spans: true });
      if (found.check === 'ok') {
        spans.push(...toParagraphSpans(paragraphs, criterion.criterionId, found.spans));
      } else if (found.check === 'unverified') {
        unlocatable.push(criterion.criterionId);
      }
    }

    return {
      paragraphs: paragraphs.map((p) => p.text),
      spans,
      unlocatable,
      truncatedByGrading: nfc.endsWith(TRUNCATION_NOTICE.trim()),
    };
  }
}
```

- [ ] **Step 4: Chạy test thuần để xác nhận nó XANH**

Run: `cd apps/api && npx jest src/grading/submission-text.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Nối route**

Trong `apps/api/src/grading/grading.module.ts`, thêm `SubmissionTextService` vào `providers`, và `RequiredDeliverableEntity` + `SubmissionEntity` vào `TypeOrmModule.forFeature([...])` nếu chưa có.

Trong `apps/api/src/grading/grading.controller.ts`, thêm vào constructor:

```ts
    private readonly submissionText: SubmissionTextService,
```

và route, đặt ngay sau `submitReview`:

```ts
  /**
   * Bài làm kèm vị trí dẫn chứng.
   *
   * `@Roles('teacher')` + kiểm sở hữu, y như 11 route còn lại: đây là bài
   * làm của sinh viên, không phải tài nguyên công khai.
   */
  @Get('grading-results/:id/submission-text')
  @Roles('teacher')
  async submissionTextForResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const result = await this.grading.findOwnedResult(id, req.user!.sub);
    return this.submissionText.forResult(result);
  }
```

> Nếu `GradingService` chưa export `findOwnedResult` public, đổi method kiểm sở hữu đang dùng bởi `submitReview` thành public thay vì viết bản thứ hai — hai đường kiểm sở hữu là hai đường sẽ lệch.

- [ ] **Step 6: Viết e2e cho quyền truy cập**

Tạo `apps/api/test/submission-text.e2e-spec.ts`:

```ts
it('403 khi giảng viên KHÁC gọi', async () => {
  await request(app.getHttpServer())
    .get(`/grading-results/${resultId}/submission-text`)
    .set('Cookie', otherTeacherCookie)
    .expect(403);
});

it('trả paragraphs và spans cho chủ sở hữu', async () => {
  const res = await request(app.getHttpServer())
    .get(`/grading-results/${resultId}/submission-text`)
    .set('Cookie', teacherCookie)
    .expect(200);
  expect(Array.isArray(res.body.paragraphs)).toBe(true);
  expect(res.body).toHaveProperty('unlocatable');
  expect(res.body).toHaveProperty('truncatedByGrading');
});
```

- [ ] **Step 7: Chạy cả hai tầng test**

Run: `cd apps/api && npx jest src/grading/submission-text && npx jest --config test/jest-e2e.json submission-text`
Expected: PASS cả hai

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grading/submission-text.service.ts apps/api/src/grading/submission-text.service.spec.ts apps/api/src/grading/grading.controller.ts apps/api/src/grading/grading.module.ts apps/api/test/submission-text.e2e-spec.ts
git commit -m "feat(grading): route trả bài làm kèm toạ độ dẫn chứng — server định vị, client chỉ vẽ"
```

---

## Task 4: Cột ghi chú cho `teacher_review` + `pinnedEvidence` vào DTO

**Files:**
- Create: `apps/api/src/migrations/<timestamp>-AddTeacherReviewNotes.ts`
- Modify: `apps/api/src/grading/entities/teacher-review.entity.ts`
- Modify: `apps/api/src/grading/dto/submit-review.dto.ts`
- Test: `apps/api/test/teacher-review-notes.e2e-spec.ts`

**Interfaces:**
- Produces: `ReviewCriterionDto` có thêm `pinnedEvidence?: string`; `SubmitReviewDto` có thêm `privateNote?: string`, `studentFeedback?: string`

> ⚠️ **Vì sao DTO phải sửa, không phải "gửi thêm trường là xong":** `main.ts` chạy `new ValidationPipe({ whitelist: true, transform: true })` **không kèm** `forbidNonWhitelisted`. Trường không khai trong DTO bị **cắt bỏ không báo**, request trả **200 OK**, và minh chứng giảng viên vừa gán biến mất không dấu vết. Cùng họ lỗi với `@Matches(undefined)` đã tốn repo này một buổi.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/api/test/teacher-review-notes.e2e-spec.ts`:

```ts
it('lưu pinnedEvidence và hai loại ghi chú', async () => {
  await request(app.getHttpServer())
    .post(`/grading-results/${resultId}/review`)
    .set('Cookie', teacherCookie)
    .send({
      criteria: [{ criterionId, verdict: 'met', points: 3, pinnedEvidence: 'em đã nêu đủ hai chiều' }],
      privateNote: 'châm chước lỗi chính tả',
      studentFeedback: 'Bài tốt, thiếu ví dụ minh hoạ.',
    })
    .expect(201);

  const rows = await dataSource.query(
    'SELECT edited_criteria, private_note, student_feedback FROM examcollect.teacher_review WHERE grading_result_id = $1',
    [resultId],
  );
  expect(rows[0].private_note).toBe('châm chước lỗi chính tả');
  expect(rows[0].student_feedback).toBe('Bài tốt, thiếu ví dụ minh hoạ.');
  expect(rows[0].edited_criteria[0].pinnedEvidence).toBe('em đã nêu đủ hai chiều');
});

it('vẫn bắt buộc chấm ĐỦ mọi tiêu chí, kể cả khi chỉ muốn gán minh chứng', async () => {
  await request(app.getHttpServer())
    .post(`/grading-results/${twoCriteriaResultId}/review`)
    .set('Cookie', teacherCookie)
    .send({ criteria: [{ criterionId: c1, verdict: 'met', points: 3, pinnedEvidence: 'abc' }] })
    .expect(400);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/api && npx jest --config test/jest-e2e.json teacher-review-notes`
Expected: FAIL — cột `private_note` không tồn tại

- [ ] **Step 3: Migration**

```bash
cd apps/api && npx typeorm migration:create src/migrations/AddTeacherReviewNotes
```

Điền:

```ts
export class AddTeacherReviewNotes1789500000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE examcollect.teacher_review
        ADD COLUMN private_note     text NULL,
        ADD COLUMN student_feedback text NULL
    `);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE examcollect.teacher_review
        DROP COLUMN private_note,
        DROP COLUMN student_feedback
    `);
  }
}
```

> **Không** đụng `guard_grading_result_ai_immutable`: trigger đó đóng băng đầu ra AI trên `grading_result`. `teacher_review` là bảng khác và là nơi sửa của con người đi vào — đó chính là thiết kế.

- [ ] **Step 4: Entity + DTO**

`teacher-review.entity.ts`, thêm sau `editedCriteria`:

```ts
  /** Ghi chú cho chính giảng viên. KHÔNG gửi cho sinh viên. */
  @Column({ name: 'private_note', type: 'text', nullable: true })
  privateNote!: string | null;

  /** Nhận xét chính thức, xuất ra phiếu phúc khảo. */
  @Column({ name: 'student_feedback', type: 'text', nullable: true })
  studentFeedback!: string | null;
```

`submit-review.dto.ts`, thêm vào `ReviewCriterionDto`:

```ts
  /**
   * Đoạn giảng viên tự bôi đen làm minh chứng, khi AI trích sai hoặc không
   * trích được. Đi cùng `verdict` và `points` vì payload là toàn bộ tiêu
   * chí — không có đường gửi riêng một tiêu chí, nên không có ca "gán minh
   * chứng mà quên cập nhật đánh giá".
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pinnedEvidence?: string;
```

và vào `SubmitReviewDto`:

```ts
  @IsOptional() @IsString() @MaxLength(4000)
  privateNote?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  studentFeedback?: string;
```

Thêm `IsOptional, IsString, MaxLength` vào import từ `class-validator`.

- [ ] **Step 5: Ghi vào `review()`**

Trong `teacher-review.service.ts`, chỗ tạo dòng `teacher_review`, thêm `privateNote: dto.privateNote ?? null` và `studentFeedback: dto.studentFeedback ?? null`. `editedCriteria` đã nhận nguyên `dto.criteria`, nên `pinnedEvidence` đi theo mà không cần sửa gì thêm.

- [ ] **Step 6: Chạy migration và test**

Run:
```bash
cd apps/api && npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
npx jest --config test/jest-e2e.json teacher-review-notes
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/migrations apps/api/src/grading/entities/teacher-review.entity.ts apps/api/src/grading/dto/submit-review.dto.ts apps/api/src/grading/teacher-review.service.ts apps/api/test/teacher-review-notes.e2e-spec.ts
git commit -m "feat(grading): teacher_review nhận ghi chú và minh chứng do giảng viên gán"
```

---

## Task 5: Sinh lại `schema.d.ts` và mở rộng client type

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (sinh tự động)
- Modify: `apps/web/src/lib/api/grading.ts`

**Interfaces:**
- Produces: `GradingResult` (web) có `advocateOpinion`, `contextUsedQuestion`, `contextUsedModelAnswer`; type `AdvocateOpinion`, `SubmissionText`, `SubmissionTextSpan`; hàm `getSubmissionText`, `getGradingReadiness`, `setGradingReference`, `requestAnswerKeyUpload`, `regradeStuck`

> `schema.d.ts` sinh **từ API đang chạy**, không từ source. Bỏ bước này thì `apps/web` fail typecheck ở đúng dòng gọi route mới.

- [ ] **Step 1: Chạy API rồi sinh lại schema**

```bash
cd apps/api && pnpm dev   # cửa sổ riêng, đợi "Nest application successfully started"
cd ../.. && pnpm generate:api-client
git diff --stat packages/shared/src/api/schema.d.ts
```
Expected: diff có `/grading-results/{id}/submission-text` và ba trường mới trong response của `grading-results`.

- [ ] **Step 2: Thêm type và hàm vào client**

Trong `apps/web/src/lib/api/grading.ts`:

```ts
/** Mirrors AdvocateOpinion (apps/api/src/grading/ai-provider/advocate.types.ts). */
export interface AdvocateOpinion {
  isCorrect: 'yes' | 'partially' | 'no';
  reasoning: string;
  evidence: string[];
  suggestedVerdicts: {
    criterionId: string;
    suggestedVerdict: 'met' | 'partially_met' | 'not_met';
    why: string;
  }[];
  /**
   * `null` = CHƯA kiểm, `[]` = đã kiểm và sạch.
   * Hiển thị hai thứ đó giống nhau là sai đúng ở chỗ nguy hiểm nhất.
   */
  unverifiedEvidence: string[] | null;
}

export interface SubmissionTextSpan {
  criterionId: string;
  paragraph: number;
  start: number;
  end: number;
}

export interface SubmissionText {
  paragraphs: string[];
  spans: SubmissionTextSpan[];
  unlocatable: string[];
  truncatedByGrading: boolean;
}

export type ReadinessLevel = 'rubric_only' | 'with_question' | 'with_model_answer';

export interface GradingReadiness {
  level: ReadinessLevel;
  warning: string | null;
  hasQuestion: boolean;
  hasModelAnswer: boolean;
}
```

Thêm ba trường vào `interface GradingResult`, ngay sau `criterionResults`:

```ts
  /** `null` = cổng phản biện KHÔNG kích hoạt, khác "đã chạy, không bênh được". */
  advocateOpinion: AdvocateOpinion | null;
  contextUsedQuestion: boolean | null;
  contextUsedModelAnswer: boolean | null;
```

Và năm hàm, theo đúng khuôn `fail(error, response)` sẵn có:

```ts
export async function getSubmissionText(gradingResultId: string): Promise<SubmissionText> {
  const { data, error, response } = await apiClient.GET(
    '/grading-results/{id}/submission-text',
    { params: { path: { id: gradingResultId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as SubmissionText;
}

export async function getGradingReadiness(examSessionId: string): Promise<GradingReadiness> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{id}/grading-readiness',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as GradingReadiness;
}

/** Bỏ trống một trường = GIỮ NGUYÊN; gửi `null` = XOÁ. Hai thứ đó khác nhau. */
export async function setGradingReference(
  examSessionId: string,
  body: {
    questionMaterialId?: string | null;
    modelAnswerStorageKey?: string | null;
    modelAnswerFilename?: string | null;
    modelAnswerNote?: string | null;
  },
): Promise<void> {
  const { error, response } = await apiClient.PUT('/exam-sessions/{id}/grading-reference', {
    params: { path: { id: examSessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function requestAnswerKeyUpload(
  examSessionId: string,
): Promise<{ storageKey: string; uploadUrl: string; expiresIn: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/grading-reference/answer-key-upload',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { storageKey: string; uploadUrl: string; expiresIn: number };
}

export async function regradeStuck(
  examSessionId: string,
): Promise<{ stuck: number; requeued: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/regrade-stuck',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { stuck: number; requeued: number };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 lỗi. Nếu `ReviewWorkspace.test.tsx` đỏ vì `GradingResult` thiếu trường mới, thêm `advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null` vào factory `result()` trong file test đó.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/web/src/lib/api/grading.ts apps/web/src/app/teacher/grading/_components/ReviewWorkspace.test.tsx
git commit -m "feat(web): client type cho advocate, readiness, grading-reference và submission-text"
```

---

# ĐỢT 1 — Cấu hình ngữ cảnh chấm

> Đây là đợt biến lượt phản biện từ code chết thành code chạy. Không có nó, đợt 3 xây một khối vĩnh viễn rỗng.

## Task 6: Hook cho readiness, grading-reference và regrade-stuck

**Files:**
- Modify: `apps/web/src/hooks/useGrading.ts`
- Test: `apps/web/src/hooks/useGrading.test.ts`

**Interfaces:**
- Consumes: các hàm từ Task 5
- Produces: `useGradingReadiness(id)`, `useSetGradingReference(id)`, `useRegradeStuck(id)`, `useSubmissionText(resultId)`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `apps/web/src/hooks/useGrading.test.ts`:

```ts
it('useSetGradingReference invalidate readiness sau khi lưu', async () => {
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useSetGradingReference('sess-1'), {
    wrapper: wrapperWith(client),
  });
  await act(async () => {
    await result.current.mutateAsync({ questionMaterialId: 'mat-1' });
  });
  expect(spy).toHaveBeenCalledWith({
    queryKey: ['exam-sessions', 'sess-1', 'grading-readiness'],
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/hooks/useGrading.test.ts`
Expected: FAIL — `useSetGradingReference is not exported`

- [ ] **Step 3: Cài đặt**

Thêm vào `apps/web/src/hooks/useGrading.ts`:

```ts
export function useGradingReadiness(examSessionId: string | undefined) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-readiness'],
    queryFn: () => getGradingReadiness(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/**
 * Lưu tài liệu tham chiếu. Invalidate readiness — mức sẵn sàng LÀ thứ vừa
 * đổi, và nó là điều kiện để lượt phản biện chạy.
 */
export function useSetGradingReference(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof setGradingReference>[1]) =>
      setGradingReference(examSessionId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-readiness'],
      });
    },
  });
}

export function useRegradeStuck(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regradeStuck(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
      });
    },
  });
}

/**
 * Bài làm kèm toạ độ dẫn chứng. `staleTime` dài: nội dung một bài đã nộp
 * không đổi, và mỗi lần gọi là một lần tải file từ kho rồi trích lại text.
 */
export function useSubmissionText(gradingResultId: string | undefined) {
  return useQuery({
    queryKey: ['grading-results', gradingResultId, 'submission-text'],
    queryFn: () => getSubmissionText(gradingResultId!),
    enabled: Boolean(gradingResultId),
    staleTime: 5 * 60 * 1000,
  });
}
```

Cập nhật import ở đầu file cho đủ năm hàm mới.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/hooks/useGrading.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useGrading.ts apps/web/src/hooks/useGrading.test.ts
git commit -m "feat(web): hook cho readiness, grading-reference, regrade-stuck, submission-text"
```

---

## Task 7: `ReadinessStrip` — ba mức, nói rõ hệ quả

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/ReadinessStrip.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ReadinessStrip.test.tsx`

**Interfaces:**
- Consumes: `GradingReadiness` (Task 5)
- Produces: `<ReadinessStrip readiness={...} onConfigure={() => void} />`

- [ ] **Step 1: Viết test thất bại**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReadinessStrip } from './ReadinessStrip';

describe('ReadinessStrip', () => {
  it('nói rõ lượt phản biện KHÔNG chạy khi chưa có đề bài', () => {
    render(
      <ReadinessStrip
        readiness={{ level: 'rubric_only', warning: null, hasQuestion: false, hasModelAnswer: false }}
        onConfigure={vi.fn()}
      />,
    );
    expect(screen.getByText(/Đang chấm ở Mức 1/)).toBeInTheDocument();
    expect(screen.getByText(/lượt phản biện.*không chạy/i)).toBeInTheDocument();
  });

  it('ở Mức 2 thì báo lượt phản biện CÓ chạy', () => {
    render(
      <ReadinessStrip
        readiness={{ level: 'with_question', warning: null, hasQuestion: true, hasModelAnswer: false }}
        onConfigure={vi.fn()}
      />,
    );
    expect(screen.getByText(/Đang chấm ở Mức 2/)).toBeInTheDocument();
  });

  it('không dùng thuật ngữ nội bộ trên màn hình', () => {
    const { container } = render(
      <ReadinessStrip
        readiness={{ level: 'with_model_answer', warning: null, hasQuestion: true, hasModelAnswer: true }}
        onConfigure={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/Advocate|rubric_only|with_question|with_model_answer/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/ReadinessStrip.test.tsx`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GradingReadiness } from '@/lib/api/grading';

const LEVEL_NUMBER = { rubric_only: 1, with_question: 2, with_model_answer: 3 } as const;

/**
 * Mức sẵn sàng đứng ĐẦU màn Điều phối, trên cả con số tiến độ.
 *
 * "Bạn đang chấm với bao nhiêu ngữ cảnh" quan trọng hơn "đã chấm bao nhiêu
 * bài": mức sẵn sàng quyết định lượt phản biện có chạy không, và lượt phản
 * biện là thứ bảo vệ sinh viên làm đúng theo một cách khác.
 */
export function ReadinessStrip({
  readiness,
  onConfigure,
}: {
  readiness: GradingReadiness;
  onConfigure: () => void;
}) {
  const level = LEVEL_NUMBER[readiness.level];
  const steps = [
    { n: 1, name: 'Thang chấm', on: true, why: 'Phiên thi đã ghim rubric.' },
    {
      n: 2,
      name: 'Đề bài',
      on: readiness.hasQuestion,
      why: readiness.hasQuestion
        ? 'Do bạn chỉ định — hệ thống không tự đoán theo tên file.'
        : 'Chọn file nào là đề bài trong số tài liệu đã tải lên.',
    },
    {
      n: 3,
      name: 'Đáp án mẫu',
      on: readiness.hasModelAnswer,
      why: readiness.hasModelAnswer
        ? 'Đã có. Đáp án không bao giờ hiển thị trên màn chấm.'
        : 'Một dòng ghi chú đáp án cũng đủ — không bắt buộc phải có file.',
    },
  ];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Mức sẵn sàng chấm · đang ở mức {level} trên 3
        </p>
        <Button variant="default" size="sm" onClick={onConfigure}>
          Cấu hình đề bài &amp; đáp án
        </Button>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-border bg-surface shadow-sm sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.n}
            className={`flex flex-col gap-1.5 border-b border-border/70 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
              step.on ? 'bg-accent-subtle/60' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small font-semibold">
                Mức {step.n} — {step.name}
              </span>
              <Badge variant={step.on ? 'accent' : 'warning'}>
                {step.on ? 'đã có' : 'chưa có'}
              </Badge>
            </div>
            <p className="text-caption text-muted-foreground">{step.why}</p>
          </div>
        ))}
      </div>

      <p className="border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Đang chấm ở Mức {level}.</span>{' '}
        {readiness.hasQuestion ? (
          <>
            Lượt phản biện có chạy ở mức này, vì nó cần đề bài mới đối chiếu được.
          </>
        ) : (
          <>
            Lượt phản biện <span className="font-semibold">không chạy</span> ở mức này — nó cần
            đề bài mới đối chiếu được. Bài của sinh viên làm đúng theo một cách khác sẽ không
            có ai lên tiếng.
          </>
        )}
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/ReadinessStrip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/_components/ReadinessStrip.tsx apps/web/src/app/teacher/grading/_components/ReadinessStrip.test.tsx
git commit -m "feat(web): dải mức sẵn sàng — nói rõ khi nào lượt phản biện không chạy"
```

---

## Task 8: `GradingReferenceDialog` — chỉ định đề bài và ghi chú đáp án

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`
- Modify: `apps/web/src/lib/api/exam-session.ts` (thêm `listExamMaterials` nếu chưa có)

**Interfaces:**
- Consumes: `useSetGradingReference` (Task 6), `GET /exam-sessions/{id}/materials`
- Produces: `<GradingReferenceDialog sessionId open onOpenChange readiness />`

- [ ] **Step 1: Viết test thất bại**

```tsx
it('liệt kê tài liệu đã tải lên để chọn ĐÚNG MỘT file làm đề bài', async () => {
  render(<GradingReferenceDialog sessionId="s1" open onOpenChange={vi.fn()} readiness={base} />);
  expect(await screen.findByLabelText('de-thi-cuoi-ky.pdf')).toBeInTheDocument();
  expect(screen.getByLabelText('dataset.csv')).toBeInTheDocument();
});

it('không tự chọn file nào theo tên — Security rule 9', async () => {
  render(<GradingReferenceDialog sessionId="s1" open onOpenChange={vi.fn()} readiness={base} />);
  const radios = await screen.findAllByRole('radio');
  expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
});

it('lưu được ghi chú đáp án mà không cần file', async () => {
  const user = userEvent.setup();
  render(<GradingReferenceDialog sessionId="s1" open onOpenChange={vi.fn()} readiness={base} />);
  await user.type(screen.getByLabelText(/Ghi chú đáp án/), 'Chấp nhận Outbox thay cho Saga.');
  await user.click(screen.getByRole('button', { name: /Lưu/ }));
  expect(setGradingReferenceMock).toHaveBeenCalledWith('s1', {
    modelAnswerNote: 'Chấp nhận Outbox thay cho Saga.',
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

Dialog dùng `@/components/ui/dialog` sẵn có. Ba khối: radio list tài liệu (không mục nào chọn sẵn, thêm mục "Không dùng đề bài" giá trị `null` để gỡ) · textarea ghi chú `maxLength={4000}` · nút Lưu.

Phần dễ sai nhất là dựng payload:

```tsx
/**
 * CHỈ gửi trường đã đổi.
 *
 * DTO phía server phân biệt ba trạng thái: không gửi = GIỮ NGUYÊN, gửi
 * `null` = XOÁ, gửi giá trị = ĐẶT. Gửi cả object mỗi lần sẽ xoá mất lựa
 * chọn đề bài ngay khi giảng viên chỉ định sửa mỗi dòng ghi chú — và họ
 * sẽ không thấy gì bất thường cho tới lượt chấm sau.
 */
function buildPayload(draft: Draft, initial: Draft) {
  const body: Parameters<typeof setGradingReference>[1] = {};
  if (draft.questionMaterialId !== initial.questionMaterialId) {
    body.questionMaterialId = draft.questionMaterialId;   // có thể là null = gỡ
  }
  if (draft.modelAnswerNote !== initial.modelAnswerNote) {
    body.modelAnswerNote = draft.modelAnswerNote === '' ? null : draft.modelAnswerNote;
  }
  return body;
}
```

Kèm dòng dưới textarea: *"Đáp án mẫu không bao giờ hiển thị trên màn chấm và không bao giờ được gửi cho AI dưới dạng đáp án — nó chỉ dùng để đối chiếu."*

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.tsx apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx apps/web/src/lib/api/exam-session.ts
git commit -m "feat(web): màn chỉ định đề bài và ghi chú đáp án — lượt phản biện chạy được lần đầu"
```

---

## Task 9: Tải đáp án mẫu lên kho (presigned URL)

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.tsx`
- Modify: `apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`

**Interfaces:**
- Consumes: `requestAnswerKeyUpload` (Task 5)

**Ràng buộc:** file **không** đi qua NestJS (Security rule 5). Thứ tự bắt buộc: xin URL → `PUT` thẳng lên kho → mới gọi `setGradingReference` với `modelAnswerStorageKey` server vừa cấp. Client **không** tự đặt khoá; server từ chối khoá lạ.

- [ ] **Step 1: Viết test thất bại**

```tsx
it('tải file lên kho TRƯỚC, rồi mới lưu tham chiếu', async () => {
  const user = userEvent.setup();
  const order: string[] = [];
  requestAnswerKeyUploadMock.mockImplementation(async () => {
    order.push('request-url');
    return { storageKey: 'grading-reference/s1/answer-key', uploadUrl: 'https://kho/put', expiresIn: 900 };
  });
  fetchMock.mockImplementation(async () => { order.push('put-object'); return { ok: true } as Response; });
  setGradingReferenceMock.mockImplementation(async () => { order.push('save-reference'); });

  render(<GradingReferenceDialog sessionId="s1" open onOpenChange={vi.fn()} readiness={base} />);
  await user.upload(screen.getByLabelText(/File đáp án mẫu/), new File(['x'], 'dap-an.docx'));
  await user.click(screen.getByRole('button', { name: /Lưu/ }));

  expect(order).toEqual(['request-url', 'put-object', 'save-reference']);
});

it('không lưu tham chiếu khi tải file thất bại', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
  // ...
  expect(setGradingReferenceMock).not.toHaveBeenCalled();
  expect(await screen.findByText(/chưa tải được file đáp án/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`
Expected: FAIL — không có input file

- [ ] **Step 3: Cài đặt**

```ts
async function uploadAnswerKey(sessionId: string, file: File): Promise<string> {
  const { storageKey, uploadUrl } = await requestAnswerKeyUpload(sessionId);
  const put = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!put.ok) {
    // Dừng HẲN ở đây. Lưu tham chiếu trỏ tới một object không tồn tại sẽ
    // cho ra một phiên báo "Mức 3" mà lúc chấm lại tụt về Mức 2 — và chỉ
    // một dòng log biết điều đó.
    throw new Error('Chưa tải được file đáp án lên kho lưu trữ. Thử lại giúp tôi.');
  }
  return storageKey;
}
```

Trong handler Lưu: nếu có file thì `const key = await uploadAnswerKey(...)` rồi đưa `modelAnswerStorageKey: key, modelAnswerFilename: file.name` vào payload.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.tsx apps/web/src/app/teacher/grading/_components/GradingReferenceDialog.test.tsx
git commit -m "feat(web): tải đáp án mẫu thẳng lên kho, không qua API server"
```

---

# ĐỢT 2 — Màn Điều phối

## Task 10: Hàm thuần phân loại và phát hiện bất thường

**Files:**
- Create: `apps/web/src/lib/grading-triage.ts`
- Create: `apps/web/src/lib/grading-triage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Bucket = 'high' | 'low' | 'flagged' | 'stuck';
  export function bucketOf(r: GradingResult, queueActive: number): Bucket
  export function countBuckets(rs: GradingResult[], queueActive: number): Record<Bucket, number>
  export interface Anomaly { kind: 'criterion-mass-loss' | 'unlocatable-evidence' | 'advocate-dissent'; count: number; total: number; criterionId?: string; averageGap?: number }
  export function advocateScore(r: GradingResult, maxByCriterion: Map<string, number>): number | null
  /** `maxByCriterion` là BẮT BUỘC: nhánh `advocate-dissent` tính khoảng cách
   *  qua `advocateScore`, mà hàm đó cần thang điểm của từng tiêu chí. */
  export function findAnomalies(rs: GradingResult[], maxByCriterion: Map<string, number>): Anomaly[]
  ```

**Vì sao tách file riêng:** đây là toàn bộ phần có logic của màn Điều phối, và nó không cần DOM. Test chạy mili giây.

- [ ] **Step 1: Viết test thất bại**

```ts
describe('bucketOf', () => {
  it('"treo" chỉ khi hàng đợi KHÔNG còn job chạy', () => {
    const r = make({ status: 'ai_grading' });
    expect(bucketOf(r, 3)).not.toBe('stuck');   // còn worker đang chạy
    expect(bucketOf(r, 0)).toBe('stuck');
  });

  it('tin cậy cao cần CẢ độ tin cậy lẫn mọi trích dẫn khớp', () => {
    expect(bucketOf(make({ confidence: 0.9, criterionResults: [c('ok')] }), 0)).toBe('high');
    expect(bucketOf(make({ confidence: 0.9, criterionResults: [c('unverified')] }), 0)).toBe('low');
  });

  it('check null KHÔNG được coi là ok', () => {
    // null = chấm trước khi hệ thống ghi lại điều này. Coi nó là 'ok' làm
    // bài cũ trông như đã được kiểm.
    expect(bucketOf(make({ confidence: 0.9, criterionResults: [c(null)] }), 0)).toBe('low');
  });
});

describe('findAnomalies', () => {
  it('bắt tiêu chí bị trừ điểm hàng loạt từ ngưỡng 60%', () => {
    const rs = Array.from({ length: 10 }, (_, i) =>
      make({ criterionResults: [{ criterionId: 'c2', verdict: i < 7 ? 'not_met' : 'met', points: 0, evidence: '' }] }),
    );
    expect(findAnomalies(rs, new Map([['c2', 4]]))).toContainEqual(
      expect.objectContaining({ kind: 'criterion-mass-loss', criterionId: 'c2', count: 7, total: 10 }),
    );
  });

  it('không báo bất thường khi dưới ngưỡng', () => {
    const rs = Array.from({ length: 10 }, (_, i) =>
      make({ criterionResults: [{ criterionId: 'c2', verdict: i < 5 ? 'not_met' : 'met', points: 0, evidence: '' }] }),
    );
    expect(findAnomalies(rs, new Map([['c2', 4]])).filter((a) => a.kind === 'criterion-mass-loss')).toEqual([]);
  });
});

describe('advocateScore', () => {
  it('quy điểm từ mức đánh giá kiến nghị, theo đúng thang rubric', () => {
    const max = new Map([['c1', 4]]);
    const r = make({
      advocateOpinion: {
        isCorrect: 'yes', reasoning: '', evidence: [], unverifiedEvidence: [],
        suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'partially_met', why: '' }],
      },
      criterionResults: [{ criterionId: 'c1', verdict: 'not_met', points: 0, evidence: '' }],
    });
    expect(advocateScore(r, max)).toBe(2);   // partially_met = nửa thang
  });

  it('trả null khi lượt phản biện KHÔNG chạy', () => {
    expect(advocateScore(make({ advocateOpinion: null }), new Map())).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/lib/grading-triage.test.ts`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

Điểm cần đúng:
- `bucketOf`: `stuck` khi `status === 'ai_grading' && queueActive === 0` — **không** đếm giờ ở client, `GRADE_JOB_TIMEOUT_MS` là biến của server và UI không biết. Đây cũng là câu chuyện `regradeStuck()` kể (nó chỉ xếp lại bài không còn job sống).
- `high` khi `confidence >= 0.7` **và** mọi `check === 'ok'`; `flagged` khi `status === 'flagged_for_review'`; còn lại `low`.
- `advocateScore`: dùng đúng bậc của `pointsFor` phía server — `met` = tối đa, `partially_met` = nửa, `not_met` = 0. Tiêu chí không được phản biện nhắc tới thì giữ điểm của lượt chấm.
- `findAnomalies` ngưỡng `0.6`.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/lib/grading-triage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/grading-triage.ts apps/web/src/lib/grading-triage.test.ts
git commit -m "feat(web): hàm thuần phân loại độ tin cậy, bất thường và điểm quy từ lượt phản biện"
```

---

## Task 11: `ConfidenceTiles` + `AnomalyPanel`

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/ConfidenceTiles.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/AnomalyPanel.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx`

**Interfaces:**
- Consumes: `countBuckets`, `findAnomalies`, `advocateScore` (Task 10)
- Produces: `<ConfidenceTiles results queueActive active onChange />`, `<AnomalyPanel results rubric />` — `rubric` để dựng `maxByCriterion`

- [ ] **Step 1: Viết test thất bại**

```tsx
it('giải thích vì sao nhiều bài bị giữ lại, như một bảo đảm chứ không như sự cố', () => {
  render(<ConfidenceTiles results={flaggedResults} queueActive={0} active="flagged" onChange={vi.fn()} />);
  expect(screen.getByText(/đây không phải lỗi/i)).toBeInTheDocument();
  expect(screen.getByText(/bảo đảm công bằng cho sinh viên/i)).toBeInTheDocument();
});

it('ô đang lọc được đánh dấu bằng aria-pressed', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ConfidenceTiles results={flaggedResults} queueActive={0} active="flagged" onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /Tin cậy cao/ }));
  expect(onChange).toHaveBeenCalledWith('high');
});

it('AnomalyPanel nói rõ khoảng cách KHÔNG phải điểm đã bị sửa', () => {
  render(<AnomalyPanel results={dissentResults} rubric={rubric} />);
  expect(screen.getByText(/không bao giờ tự sửa điểm/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/ConfidenceTiles.test.tsx src/app/teacher/grading/_components/AnomalyPanel.test.tsx`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

```tsx
const TILES = [
  { key: 'high',    tone: 'success',          label: 'Tin cậy cao',  hint: 'Mọi trích dẫn đều tìm thấy trong bài làm.' },
  { key: 'low',     tone: 'warning',          label: 'Tin cậy thấp', hint: 'Một phần trích dẫn không đối chiếu được.' },
  { key: 'flagged', tone: 'danger',           label: 'Cần bạn duyệt', hint: 'Lượt phản biện không đồng ý, hoặc trích dẫn chưa đối chiếu được.' },
  { key: 'stuck',   tone: 'muted-foreground', label: 'Treo',         hint: 'Quá hạn xử lý — chấm lại được ngay.' },
] as const;

export function ConfidenceTiles({ results, queueActive, active, onChange }: Props) {
  const counts = countBuckets(results, queueActive);
  return (
    <section className="flex flex-col gap-2">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Phân loại độ tin cậy · bấm để lọc
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={active === t.key}
            onClick={() => onChange(t.key)}
            style={{ borderLeftColor: `hsl(var(--${t.tone}))` }}
            className="flex flex-col gap-1 rounded-lg border border-l-[3px] border-border bg-surface p-4 text-left shadow-sm transition-[box-shadow,transform] duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-md aria-pressed:border-primary/35 aria-pressed:bg-primary/[0.06]"
          >
            <span className="text-display tabular-nums">{counts[t.key]}</span>
            <span className="text-small font-semibold">{t.label}</span>
            <span className="text-caption text-muted-foreground">{t.hint}</span>
          </button>
        ))}
      </div>
      {/* … dòng giải thích bên dưới … */}
    </section>
  );
}
```

Dưới lưới là dòng:

> **N bài được giữ lại để bạn duyệt — đây không phải lỗi.** Ở cấu hình hiện tại, hệ thống không tự duyệt bài nào: mọi đề xuất điểm đều phải qua mắt người trước khi trở thành điểm thật. Toàn bộ bài có điểm trừ được chuyển sang đây để bạn bảo đảm công bằng cho sinh viên.

`AnomalyPanel`: render `findAnomalies()`. Với `advocate-dissent` bắt buộc kèm câu *"Lượt phản biện chỉ nêu ý kiến, không bao giờ tự sửa điểm — con số trên là khoảng cách giữa hai lập luận, không phải điểm đã bị thay đổi."*

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/_components/ConfidenceTiles.tsx apps/web/src/app/teacher/grading/_components/ConfidenceTiles.test.tsx apps/web/src/app/teacher/grading/_components/AnomalyPanel.tsx apps/web/src/app/teacher/grading/_components/AnomalyPanel.test.tsx
git commit -m "feat(web): ô phân loại độ tin cậy và bảng bất thường diện rộng"
```

---

## Task 12: Lắp màn Điều phối

**Files:**
- Modify: `apps/web/src/app/teacher/grading/page.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.test.tsx`

**Interfaces:**
- Consumes: `ReadinessStrip` (T7), `GradingReferenceDialog` (T8), `ConfidenceTiles` + `AnomalyPanel` (T11), `useRegradeStuck` (T6)

**Ràng buộc:** `page.tsx` hiện 383 dòng. Sau khi thêm, nếu vượt 500 thì tách phần chọn phiên sang `_components/SessionPicker.tsx`.

- [ ] **Step 1: Viết test thất bại**

```tsx
it('dải mức sẵn sàng đứng TRƯỚC tiến độ chấm', async () => {
  render(<GradingPage />, { wrapper });
  const readiness = await screen.findByText(/Mức sẵn sàng chấm/);
  const progress = screen.getByText(/Đã chấm/);
  expect(readiness.compareDocumentPosition(progress)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it('nút chấm lại bài treo chỉ bật khi hàng đợi không còn job chạy', async () => {
  // queue.active = 2 -> tắt; = 0 và có bài ai_grading -> bật
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Thứ tự trên màn, đúng spec §4.1: `ReadinessStrip` → `ConfidenceTiles` → `AnomalyPanel` → danh sách bài (lọc theo bucket đang chọn) · cột phải: tiến độ + nút *"Chấm lại N bài treo"*.

Nút chấm lại: `disabled={progress.queue.active > 0 || stuckCount === 0}`, kèm `title` nói rõ vì sao khi tắt.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/ && npx tsc --noEmit && npx eslint src --ext .ts,.tsx`
Expected: PASS, 0 lỗi

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/grading/page.tsx apps/web/src/app/teacher/grading/page.test.tsx
git commit -m "feat(web): màn Điều phối — mức sẵn sàng, phân loại tin cậy, bất thường, đối soát bài treo"
```

---

## Task 12b: Panel chưa có backend, và cảnh báo ngữ cảnh lệch

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/NotBuiltYetPanel.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/NotBuiltYetPanel.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`

**Interfaces:**
- Produces: `<NotBuiltYetPanel title missing>{children}</NotBuiltYetPanel>`

**Vì sao task này tồn tại:** spec §3.3. Điều khiển hàng đợi và chấm thử nằm trong plan giao diện của chủ đồ án nhưng backend chưa có route. Vẽ chúng như đang chạy là nói dối; **bỏ hẳn** chúng đi thì người đọc màn hình không biết chúng đã được cân nhắc. Cả hai đều sai — nên chúng hiện ra, viền đứt, có nhãn, và nút **tắt**.

- [ ] **Step 1: Viết test thất bại**

```tsx
it('nút bên trong panel luôn bị tắt', () => {
  render(
    <NotBuiltYetPanel title="Điều khiển hàng đợi" missing="Cần 3 endpoint mới.">
      <button type="button">Tạm dừng</button>
    </NotBuiltYetPanel>,
  );
  expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeDisabled();
});

it('nói rõ còn thiếu gì, không im lặng', () => {
  render(<NotBuiltYetPanel title="Chấm thử trước" missing="start-grading chưa nhận danh sách con." />);
  expect(screen.getByText(/chưa có/i)).toBeInTheDocument();
  expect(screen.getByText(/start-grading chưa nhận danh sách con/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/NotBuiltYetPanel.test.tsx`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

```tsx
/**
 * Khối tính năng đã thiết kế nhưng backend chưa có đường.
 *
 * `<fieldset disabled>` chứ không phải tự gắn `disabled` lên từng nút: nó
 * tắt mọi control bên trong, kể cả control thêm vào sau, nên không có ca
 * "một nút lọt lưới rồi gọi một route không tồn tại".
 */
export function NotBuiltYetPanel({
  title,
  missing,
  children,
}: {
  title: string;
  missing: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative rounded-lg border border-dashed border-border bg-surface p-4">
      <span className="absolute -top-2.5 right-3 rounded-sm border border-dashed border-border bg-background px-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        chưa có
      </span>
      <h3 className="text-small font-semibold">{title}</h3>
      <fieldset disabled className="mt-2 flex flex-wrap gap-2">
        {children}
      </fieldset>
      <p className="mt-2 border-l-2 border-border pl-2.5 text-caption text-muted-foreground">
        {missing}
      </p>
    </section>
  );
}
```

Trong `page.tsx`, cột phải, dưới thẻ tiến độ:

```tsx
<NotBuiltYetPanel
  title="Điều khiển hàng đợi"
  missing="Hàng đợi đã có sẵn cơ chế tạm dừng và chạy lại, nhưng chưa có đường gọi từ đây."
>
  <Button variant="outline" size="sm">Tạm dừng</Button>
  <Button variant="outline" size="sm">Huỷ phần còn lại</Button>
  <Button variant="outline" size="sm">Chạy lại bài lỗi</Button>
</NotBuiltYetPanel>

<NotBuiltYetPanel
  title="Chấm thử trước"
  missing="Hiện chỉ chấm được cả phiên một lượt, chưa chọn được một nhóm nhỏ để thử."
>
  <Button variant="outline" size="sm">Chọn 3 bài chấm thử</Button>
</NotBuiltYetPanel>
```

- [ ] **Step 4: Cảnh báo ngữ cảnh lệch**

Spec §5.5 hàng cuối: mức sẵn sàng báo *có* đề bài, nhưng `contextUsedQuestion === false` nghĩa là **file đã bị xoá khỏi kho sau khi ghi nhận** — lượt chấm âm thầm chạy ở mức thấp hơn. Thêm vào `page.tsx`:

```tsx
{readiness.data?.hasQuestion &&
  results.data?.some((r) => r.contextUsedQuestion === false) && (
    <Alert variant="warning">
      <AlertDescription>
        Phiên này được cấu hình có đề bài, nhưng một số bài đã chấm{' '}
        <span className="font-semibold">mà không đọc được đề</span> — nhiều khả năng file đã bị
        xoá khỏi kho sau khi chỉ định. Những bài đó chấm ở mức ngữ cảnh thấp hơn bạn nghĩ.
      </AlertDescription>
    </Alert>
  )}
```

> `=== false` chứ không phải `!r.contextUsedQuestion`: `null` nghĩa là bài chấm trước khi hệ thống ghi lại điều này, và gộp nó vào đây sẽ báo động giả trên mọi bài cũ.

- [ ] **Step 5: Chạy test và commit**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/ && npx tsc --noEmit`
Expected: PASS

```bash
git add apps/web/src/app/teacher/grading
git commit -m "feat(web): panel chưa có backend hiện ra có nhãn, và cảnh báo khi ngữ cảnh chấm lệch cấu hình"
```

---

# ĐỢT 3 — Bàn chấm

## Task 13: Route Bàn chấm + `AnswerPane` tô sáng theo span

**Files:**
- Create: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/AnswerPane.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/AnswerPane.test.tsx`

**Interfaces:**
- Consumes: `useSubmissionText` (T6), `SubmissionText` (T5)
- Produces: `<AnswerPane text={SubmissionText} activeCriterionId onSelectCriterion onPin />`

**Ràng buộc tuyệt đối:** **không có phép so chuỗi nào trong file này.** Component chỉ đọc `spans` server trả về.

- [ ] **Step 1: Viết test thất bại**

```tsx
const TEXT: SubmissionText = {
  paragraphs: ['Ưu điểm là mở rộng độc lập.', 'Nhược điểm là phân mảnh dữ liệu.'],
  spans: [
    { criterionId: 'c1', paragraph: 0, start: 12, end: 27 },
    { criterionId: 'c2', paragraph: 0, start: 20, end: 27 },   // chồng lấn với c1
    { criterionId: 'c3', paragraph: 1, start: 0, end: 9 },
  ],
  unlocatable: ['c4'],
  truncatedByGrading: false,
};

it('tô đúng đoạn theo span, không tự đi tìm chuỗi', () => {
  render(<AnswerPane text={TEXT} activeCriterionId={null} onSelectCriterion={vi.fn()} onPin={vi.fn()} />);
  const marks = screen.getAllByTestId('evidence-mark');
  expect(marks[0]).toHaveTextContent('mở rộng độc lập');
});

it('span chồng lấn: giữ span bắt đầu trước, bỏ phần giao', () => {
  render(<AnswerPane text={TEXT} activeCriterionId={null} onSelectCriterion={vi.fn()} onPin={vi.fn()} />);
  // c2 giao hoàn toàn vào c1 -> chỉ một mark trong đoạn 0
  const paragraph = screen.getByTestId('paragraph-0');
  expect(paragraph.querySelectorAll('[data-testid="evidence-mark"]')).toHaveLength(1);
});

it('cảnh báo khi bài đã bị cắt lúc chấm', () => {
  render(<AnswerPane text={{ ...TEXT, truncatedByGrading: true }} activeCriterionId={null} onSelectCriterion={vi.fn()} onPin={vi.fn()} />);
  expect(screen.getByText(/phần cuối bài không được chấm/i)).toBeInTheDocument();
});

it('nội dung rỗng nói rõ lý do, không hiện khung trắng', () => {
  render(<AnswerPane text={{ paragraphs: [''], spans: [], unlocatable: [], truncatedByGrading: false }} activeCriterionId={null} onSelectCriterion={vi.fn()} onPin={vi.fn()} />);
  expect(screen.getByText(/chưa đọc được nội dung/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/\[resultId\]/_components/AnswerPane.test.tsx`
Expected: FAIL — module không tồn tại

- [ ] **Step 3: Cài đặt**

```tsx
/**
 * Bài làm, tô theo toạ độ SERVER trả về.
 *
 * Không có `indexOf` nào ở đây, và đó là quyết định thiết kế chứ không phải
 * sự lười. Phép đối chiếu chạy trên cả bài ĐÃ LÀM PHẲNG ở server, nên chỉ
 * phía đó định vị đúng được — kể cả trích dẫn vắt qua hai đoạn. Tự so lại ở
 * client sẽ trượt đúng những ca đó và hiện "không tìm thấy" cho câu mà hệ
 * thống đã xác nhận có thật.
 */
function marksFor(spans: SubmissionTextSpan[], paragraph: number) {
  // Chồng lấn: sắp theo start, giữ span đầu, bỏ phần giao. Hai tiêu chí
  // trích cùng một câu là chuyện có thật, và tô lồng nhau cho ra HTML không
  // đọc được. Đây là quyết định TRÌNH BÀY, nên nó ở client.
  const inPara = spans.filter((s) => s.paragraph === paragraph).sort((a, b) => a.start - b.start);
  const kept: SubmissionTextSpan[] = [];
  let cursor = -1;
  for (const s of inPara) {
    if (s.start >= cursor) { kept.push(s); cursor = s.end; }
  }
  return kept;
}
```

Render từng đoạn thành `<p data-testid={'paragraph-' + i}>`, cắt theo `kept`, bọc `<mark data-testid="evidence-mark" data-criterion={...}>`. Màu qua `style={{ '--hl': hueFor(criterionId) }}`.

Khi `truncatedByGrading` → `<Alert variant="warning">` *"Bài dài quá giới hạn chấm tự động — phần cuối bài không được chấm."*
Khi mọi `paragraphs` rỗng → *"Hệ thống chưa đọc được nội dung bài làm này (định dạng chưa hỗ trợ). Bạn tải file gốc về chấm tay."*

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/teacher/grading/[resultId]"
git commit -m "feat(web): cột bài làm tô theo toạ độ server — client không so chuỗi"
```

---

## Task 14: `CriterionCard` — đánh giá, độ tin cậy, trạng thái đối chiếu

**Files:**
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/CriterionCard.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/CriterionCard.test.tsx`

**Interfaces:**
- Produces: `<CriterionCard criterion maxPoints points onPoints active onActivate unlocatable />`

- [ ] **Step 1: Viết test thất bại**

```tsx
it('phân biệt ba trạng thái đối chiếu, và null KHÔNG giống ok', () => {
  const { rerender } = render(<CriterionCard {...base} criterion={c({ check: 'ok' })} />);
  expect(screen.getByText(/khớp từng chữ/i)).toBeInTheDocument();

  rerender(<CriterionCard {...base} criterion={c({ check: null })} />);
  expect(screen.getByText(/chưa đối chiếu/i)).toBeInTheDocument();
  expect(screen.queryByText(/khớp từng chữ/i)).not.toBeInTheDocument();

  rerender(<CriterionCard {...base} criterion={c({ check: 'unverified' })} />);
  expect(screen.getByText(/không có trong bài làm/i)).toBeInTheDocument();
});

it('gọi độ tin cậy là PHÉP ĐO, không phải AI tự chấm', () => {
  render(<CriterionCard {...base} />);
  expect(screen.getByLabelText(/độ tin cậy/i)).toBeInTheDocument();
  expect(screen.getByText(/đối chiếu/i)).toBeInTheDocument();
});

it('nút điểm nhanh theo đúng thang của tiêu chí', async () => {
  const onPoints = vi.fn();
  const user = userEvent.setup();
  render(<CriterionCard {...base} maxPoints={4} onPoints={onPoints} />);
  await user.click(screen.getByRole('button', { name: '2' }));
  expect(onPoints).toHaveBeenCalledWith(2);
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/\[resultId\]/_components/CriterionCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Ba badge: mức đánh giá (`Đạt`/`Đạt một phần`/`Chưa đạt`), trạng thái đối chiếu (`trích dẫn khớp từng chữ` / `chưa đối chiếu` / `không có trong bài làm` / `AI không đưa trích dẫn nào`), và thanh độ tin cậy có `aria-label="độ tin cậy"` kèm chú thích *"đo bằng cách đối chiếu trích dẫn với bài làm"*.

Khi `check === 'unverified'`: khối trích dẫn đổi sang nền gạch chéo `danger` + câu *"Đối chiếu từng chữ: câu này không có trong bài làm. AI đã diễn giải lại thay vì trích nguyên văn."*

Nút điểm nhanh: `[0]`, `[maxPoints/2]`, `[maxPoints]`.

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/teacher/grading/[resultId]/_components/CriterionCard.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/CriterionCard.test.tsx"
git commit -m "feat(web): thẻ tiêu chí — ba trạng thái đối chiếu, độ tin cậy là phép đo"
```

---

## Task 15: `AdvocatePanel` — ý kiến, không bao giờ là điểm

**Files:**
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/AdvocatePanel.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/AdvocatePanel.test.tsx`

**Interfaces:**
- Produces: `<AdvocatePanel opinion={AdvocateOpinion | null} criterionId maxPoints hasQuestion onApply />`

- [ ] **Step 1: Viết test thất bại**

```tsx
it('phân biệt "chưa kiểm" với "đã kiểm và sạch"', () => {
  const { rerender } = render(<AdvocatePanel {...base} opinion={op({ unverifiedEvidence: [] })} />);
  expect(screen.getByText(/tất cả đều có trong bài làm/i)).toBeInTheDocument();

  rerender(<AdvocatePanel {...base} opinion={op({ unverifiedEvidence: null })} />);
  expect(screen.getByText(/chưa đối chiếu/i)).toBeInTheDocument();
  expect(screen.queryByText(/tất cả đều có trong bài làm/i)).not.toBeInTheDocument();
});

it('KHÔNG loại bỏ kiến nghị khi có trích dẫn trượt — chỉ nêu ra', () => {
  render(<AdvocatePanel {...base} opinion={op({ unverifiedEvidence: ['câu bịa'] })} />);
  expect(screen.getByText(/1 trích dẫn không tìm thấy/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /theo phản biện/i })).toBeEnabled();
});

it('opinion null: nói VÌ SAO, không hiện khối rỗng', () => {
  render(<AdvocatePanel {...base} opinion={null} hasQuestion={false} />);
  expect(screen.getByText(/chưa nạp đề bài nên lượt phản biện không chạy/i)).toBeInTheDocument();
});

it('nút áp kiến nghị là do GIẢNG VIÊN bấm, phát ra điểm quy từ mức đánh giá', async () => {
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<AdvocatePanel {...base} maxPoints={4} opinion={op({ suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'met', why: '' }] })} onApply={onApply} />);
  await user.click(screen.getByRole('button', { name: /theo phản biện/i }));
  expect(onApply).toHaveBeenCalledWith({ verdict: 'met', points: 4 });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/\[resultId\]/_components/AdvocatePanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Nền `info-subtle`, tiêu đề *"Lượt phản biện — bênh vực sinh viên"*. Cuối khối, dòng cố định:

> Lượt phản biện không đưa ra điểm, và không có đường nào để nó làm thế — hệ thống chặn ở ba lớp độc lập.

theo sau bởi một trong ba câu tuỳ `unverifiedEvidence`: `null` → *"Các trích dẫn chưa đối chiếu."*; `[]` → *"Đã đối chiếu N trích dẫn, tất cả đều có trong bài làm."*; có phần tử → *"N trích dẫn không tìm thấy trong bài làm."*

- [ ] **Step 4: Chạy test để xác nhận nó XANH**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/teacher/grading/[resultId]/_components/AdvocatePanel.tsx" "apps/web/src/app/teacher/grading/[resultId]/_components/AdvocatePanel.test.tsx"
git commit -m "feat(web): khối lượt phản biện — kiến nghị hiện ra, điểm vẫn do người quyết"
```

---

## Task 16: Lắp Bàn chấm, gán minh chứng ngược, lưu duyệt

**Files:**
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Create: `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx`
- Modify: `apps/web/src/lib/api/grading.ts` (`ReviewCriterion` thêm `pinnedEvidence?`)
- Modify: `apps/web/src/app/teacher/grading/_components/ReviewWorkspace.tsx` (đổi sang điều hướng route)

- [ ] **Step 1: Viết test thất bại**

```tsx
it('bôi đen một đoạn rồi gán làm minh chứng thì gửi kèm ĐỦ mọi tiêu chí', async () => {
  const user = userEvent.setup();
  render(<GradingDetailPage params={{ resultId: 'r1' }} />, { wrapper });
  // ... mô phỏng selection trong AnswerPane, chọn "Gán cho TC2"
  await user.click(screen.getByRole('button', { name: /Lưu duyệt/ }));

  expect(submitReviewMock).toHaveBeenCalledWith('r1', [
    { criterionId: 'c1', verdict: 'met', points: 3 },
    { criterionId: 'c2', verdict: 'met', points: 4, pinnedEvidence: 'đoạn được bôi đen' },
  ]);
});

it('bài đang chấm thì chỉ đọc', async () => {
  render(<GradingDetailPage params={{ resultId: 'grading' }} />, { wrapper });
  expect(await screen.findByText(/AI đang chấm bài này/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Lưu duyệt/ })).not.toBeInTheDocument();
});

it('bài đã chốt thì cảnh báo sẽ ghi nhật ký', async () => {
  render(<GradingDetailPage params={{ resultId: 'finalized' }} />, { wrapper });
  expect(await screen.findByText(/ghi vào nhật ký/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/\[resultId\]/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Cài đặt**

Layout hai cột `lg:grid-cols-2`. Bấm tiêu đề tiêu chí → `activeCriterionId` đổi → `AnswerPane` cuộn tới `<mark>` tương ứng bằng `scrollIntoView({ block: 'center' })`, tôn trọng `prefers-reduced-motion`.

Gán minh chứng: `window.getSelection()` trong `AnswerPane`, popup chọn tiêu chí, ghi vào state `draft[criterionId].pinnedEvidence`. **Payload lưu vẫn là toàn bộ tiêu chí** — `validateAndTotal` từ chối payload thiếu tiêu chí, nên không có ca gán minh chứng mà quên cập nhật đánh giá.

Sửa `ReviewCriterion` trong `lib/api/grading.ts`:

```ts
export interface ReviewCriterion {
  criterionId: string;
  verdict: 'met' | 'partially_met' | 'not_met';
  points: number;
  /** Đoạn giảng viên tự bôi đen, khi AI trích sai hoặc không trích được. */
  pinnedEvidence?: string;
}
```

Sửa `ReviewWorkspace.tsx`: hàng trong rail trái đổi từ `setSelectedId` sang `<Link href={'/teacher/grading/' + result.id}>`.

`scroll-padding-top` trên vùng cuộn để header dính không che mất focus (WCAG 2.2 AA "Focus Not Obscured").

- [ ] **Step 4: Chạy toàn bộ và kiểm tra chéo**

Run:
```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npx eslint src --ext .ts,.tsx
cd ../api && npx tsc --noEmit && npx jest && node ../../scripts/find-import-cycles.js src
```
Expected: tất cả PASS; find-import-cycles in `0`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): Bàn chấm — tô sáng hai chiều, gán minh chứng ngược, lưu duyệt"
```

---

## Task 17: e2e — lượt phản biện chạy thật lần đầu tiên

**Files:**
- Create: `apps/api/test/advocate-end-to-end.e2e-spec.ts`

**Vì sao task này là task cuối và là task quan trọng nhất:** nó chứng minh luận điểm §0 của spec bằng một thứ chạy được, không phải bằng một đoạn văn. Trước nó, `advocate_opinion` chưa từng khác `null` trong một lần chạy thật.

- [ ] **Step 1: Viết test**

```ts
it('đặt đề bài -> readiness lên with_question -> chấm -> advocate_opinion khác null', async () => {
  // 1. Tải một tài liệu lên phiên, lấy materialId.
  // 2. PUT grading-reference với questionMaterialId đó.
  await request(app.getHttpServer())
    .put(`/exam-sessions/${sessionId}/grading-reference`)
    .set('Cookie', teacherCookie)
    .send({ questionMaterialId: materialId })
    .expect(200);

  // 3. readiness phải lên mức 2.
  const readiness = await request(app.getHttpServer())
    .get(`/exam-sessions/${sessionId}/grading-readiness`)
    .set('Cookie', teacherCookie)
    .expect(200);
  expect(readiness.body.level).toBe('with_question');

  // 4. Chấm bằng provider giả luôn trả một tiêu chí `not_met` — đó là cổng
  //    kích hoạt lượt phản biện.
  await request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/start-grading`)
    .set('Cookie', teacherCookie)
    .expect(201);
  await waitForGradingToSettle(sessionId);

  // 5. Cái chưa từng đúng trước task này.
  const results = await request(app.getHttpServer())
    .get(`/exam-sessions/${sessionId}/grading-results`)
    .set('Cookie', teacherCookie)
    .expect(200);
  expect(results.body[0].advocateOpinion).not.toBeNull();
  expect(results.body[0].contextUsedQuestion).toBe(true);
});

it('không có đề bài thì lượt phản biện KHÔNG chạy', async () => {
  // Cùng kịch bản, bỏ bước 2. advocate_opinion phải là null — đây là trạng
  // thái mà toàn hệ thống đã nằm trong đó cho tới hôm nay.
  expect(results.body[0].advocateOpinion).toBeNull();
});
```

- [ ] **Step 2: Chạy test**

Run:
```bash
docker compose up -d postgres minio redis
# bucket `examcollect-submissions` phải tồn tại — thiếu nó cho ra lỗi trông y hệt lỗi nghiệp vụ
cd apps/api && npx jest --config test/jest-e2e.json advocate-end-to-end
```
Expected: PASS cả hai ca

- [ ] **Step 3: Cập nhật tài liệu**

Trong `docs/grading-system-guide.md`:
- §2 sơ đồ tầng 1: bỏ bốn dấu `✗` giờ đã có UI; bỏ dòng "✗ KHÔNG có màn hình nào cho: chọn đề bài · đáp án mẫu · readiness · ý kiến Advocate · context_used · đối soát bài treo".
- §4 bảng file: thêm `submission-text.service.ts`.
- §11: xoá dòng "Toàn bộ UI cho advocate / anchor / readiness"; giữ lại phần anchor.
- Tầng 4 bước ⑤: xoá dòng "✗ Hôm nay điều kiện 3 KHÔNG BAO GIỜ đúng".

- [ ] **Step 4: Chạy toàn bộ bộ test lần cuối**

Run:
```bash
cd apps/api && npx jest && npx jest --config test/jest-e2e.json && npx eslint src test --ext .ts
cd ../web && npx vitest run && npx eslint src --ext .ts,.tsx && npx next build
```
Expected: tất cả xanh

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/advocate-end-to-end.e2e-spec.ts docs/grading-system-guide.md
git commit -m "test(grading): lượt phản biện chạy thật lần đầu — e2e khoá lại cả hai chiều"
```

---

## Kiểm tra sau khi xong đợt 0→3

- [ ] `grep -rn "advocate\|readiness\|contextUsed" apps/web/src` — trước đợt này trả **0**; giờ phải có kết quả
- [ ] Mở một phiên thật, chỉ định đề bài, chấm, và **nhìn thấy ý kiến lượt phản biện trên màn hình**
- [ ] `node scripts/find-import-cycles.js apps/api/src` in `0`
- [ ] Không màn hình nào lộ chữ `Advocate`, `Grader`, `rubric_only`, `with_question`, `tier-1`, `flagged_for_review`
- [ ] `docs/grading-system-guide.md` §11 không còn nói UI advocate/readiness là "chưa có"
