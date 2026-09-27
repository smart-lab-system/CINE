import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { sandboxLanguage } from '../../sandbox/contract';
import { StorageService } from '../../storage/storage.service';
import { extractText } from '../extract-text';
import { GradingReferenceService } from '../grading-reference.service';
import { readInvestigationBudget } from '../investigator/budget';
import type { InvestigationContext } from '../investigator/types';
import type { StoredInvestigation } from '../scoring/stored-investigation';
import { loadRuleEntries } from './rule-entries';
import { sourceFilesOf } from './source-files';

export type BuiltContext =
  | { kind: 'ok'; ctx: InvestigationContext; ruleTable: StoredInvestigation['ruleTable']; teacherId: string }
  | { kind: 'ungradable'; class: 'system' | 'submission'; reason: string };

const system = (reason: string): BuiltContext => ({ kind: 'ungradable', class: 'system', reason });

/**
 * Dựng `InvestigationContext` cho MỘT bài từ DB và kho lưu trữ — `investigate()` thì thuần, không
 * đọc gì (§12.5). Thiếu thứ gì thì nói ra đúng lớp (§4.4): thiếu thước, thiếu đề chữ, kho lỗi là
 * phía hệ thống (sửa xong thì chấm lại được); byte bài nộp không đọc được là của bài.
 */
@Injectable()
export class InvestigationContextService {
  private readonly logger = new Logger(InvestigationContextService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly references: GradingReferenceService,
  ) {}

  async build(resultId: string): Promise<BuiltContext> {
    const [row] = await this.ds.query(
      `SELECT s.storage_key, s.exam_session_id, es.teacher_id, es.test_bundle_id,
              rd.required_filename, rd.language
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
         JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
        WHERE g.id = $1`,
      [resultId],
    );
    if (!row) throw new Error(`không có kết quả chấm ${resultId}`);

    const language = sandboxLanguage.safeParse(row.language);
    if (!language.success) return system(`bài khai ngôn ngữ "${row.language}" — đường chấm điều tra chỉ chạy C++ và Python`);
    if (!row.test_bundle_id) return system('phiên chưa ghim gói test — không có thước để chạy (§4.4)');

    const reference = await this.references.loadForGrading(row.exam_session_id);
    const problemStatement = reference.questionPdf
      ? (await extractText(reference.questionPdf, reference.questionFilename ?? '')).trim()
      : '';
    if (!problemStatement) {
      const name = reference.questionFilename ? ` (${reference.questionFilename})` : '';
      return system(`đề bài chưa đọc được thành chữ${name} — đường chấm điều tra cần đề dạng DOCX hay TXT`);
    }

    if (!row.storage_key) return system('bài nộp chưa có file trên kho lưu trữ');
    let bytes: Buffer;
    try {
      bytes = await this.storage.getObject(row.storage_key);
    } catch (error) {
      this.logger.warn(`kết quả ${resultId}: không đọc được bài nộp — ${error instanceof Error ? error.message : String(error)}`);
      return system('không đọc được bài nộp từ kho lưu trữ');
    }
    const sources = await sourceFilesOf(bytes, row.required_filename, language.data);
    if (sources.kind === 'ungradable') return sources;

    const cases: { case_key: string; group: string; input: string; expected_output: string }[] = await this.ds.query(
      `SELECT case_key, "group", input, expected_output FROM examcollect.grading_test_case
        WHERE bundle_id = $1 AND auto_dropped_reason IS NULL ORDER BY case_key`,
      [row.test_bundle_id],
    );
    const { entries, ruleTable } = await loadRuleEntries(this.ds.manager, row.teacher_id);

    return {
      kind: 'ok',
      teacherId: row.teacher_id,
      ruleTable,
      ctx: {
        language: language.data,
        problemStatement,
        // Bước 4 (`run_scaled`) mới đo được độ phức tạp; bài là chương trình trọn vẹn có `main`.
        requiredComplexity: null,
        driver: null,
        entry: sources.entry,
        submission: { files: sources.files },
        testBundle: {
          id: row.test_bundle_id,
          cases: cases.map((c) => ({ name: c.case_key, group: c.group, input: c.input, expected: c.expected_output })),
        },
        modelAnswerAvailable: reference.modelAnswer !== undefined,
        rules: entries,
        budget: readInvestigationBudget(process.env).budget,
      },
    };
  }
}
