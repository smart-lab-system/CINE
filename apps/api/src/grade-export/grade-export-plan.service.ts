import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { formatHundredths } from '../grading/scoring/hundredths';
import { BLANK_LABELS } from './blank-reason';
import { attribute, summarizeChanges, type Cause, type ChangesSummary } from './diff-rules';
import type { PlanDto } from './dto/plan.dto';
import { GradeExportDataService } from './grade-export.data';
import { MSG } from './grade-export.messages';
import { GradeExportService } from './grade-export.service';
import { MAX_COLUMNS, MAX_DATA_ROWS, type BlankReason } from './grade-export.types';
import { buildPlan, type Direction, type ExportPlan, type FileCell, type FileRowInput, type PreviousWrite, type RowAction } from './plan';
import { cellAt, isMergedNonMaster, type SheetRead } from './xlsx/workbook-reader';
import { colToIndex } from './xlsx/xml-text';
import type { ZipEntry } from './xlsx/zip-io';

export interface PlanContext {
  /** `plan.rows` đã mang `causes` cho các dòng đổi so với lần ghi trước. */
  plan: ExportPlan;
  changes: ChangesSummary | null;
  deliverableId: string | null;
  entries: ZipEntry[];
  sheetPath: string;
}

export interface PlanRowView {
  row: number;
  mssvInFile: string;
  studentMssv: string | null;
  studentName: string | null;
  action: RowAction;
  /** Chuỗi thập phân ("7.25") — web định dạng bằng dấu phẩy; không bao giờ là số thực. */
  systemScore: string | null;
  writtenScore: string | null;
  blankReason: BlankReason | null;
  blankLabel: string | null;
  previousScore: string | null;
  direction: Direction | null;
  causes: Cause[];
  note: string | null;
}
export interface NotInFileView {
  mssv: string;
  name: string;
  blankReason: BlankReason | null;
  blankLabel: string | null;
  score: string | null;
}
export interface PlanResponse {
  digest: string;
  deliverableId: string | null;
  roundingStepHundredths: number;
  summary: ExportPlan['summary'];
  overwrite: ExportPlan['overwrite'];
  changes: ChangesSummary | null;
  blockers: string[];
  canWrite: boolean;
  rows: PlanRowView[];
  notInFile: NotInFileView[];
}

function fileCell(sheet: SheetRead, col: number, row: number): FileCell {
  const cell = cellAt(sheet, col, row);
  return { text: cell.text, kind: cell.kind, hasFormula: cell.hasFormula, mergedNonMaster: isMergedNonMaster(sheet, col, row) };
}

export function toPlanResponse(ctx: PlanContext, dto: PlanDto): PlanResponse {
  const { plan } = ctx;
  const score = (hundredths: number | null) => (hundredths === null ? null : formatHundredths(hundredths));
  return {
    digest: plan.digest,
    deliverableId: ctx.deliverableId,
    roundingStepHundredths: dto.roundingStepHundredths,
    summary: plan.summary,
    overwrite: plan.overwrite,
    changes: ctx.changes,
    blockers: plan.blockers,
    canWrite: plan.blockers.length === 0,
    rows: plan.rows.map((r) => ({
      row: r.row,
      mssvInFile: r.mssvInFile,
      studentMssv: r.studentMssv,
      studentName: r.studentName,
      action: r.action,
      systemScore: score(r.systemHundredths),
      writtenScore: score(r.writtenHundredths),
      blankReason: r.blankReason,
      blankLabel: r.blankReason ? BLANK_LABELS[r.blankReason] : null,
      previousScore: score(r.previousHundredths),
      direction: r.direction,
      causes: r.causes,
      note: r.note,
    })),
    notInFile: plan.notInFile.map((s) => {
      const reason = s.outcome.kind === 'blank' ? s.outcome.reason : null;
      return {
        mssv: s.mssv,
        name: s.name,
        blankReason: reason,
        blankLabel: reason ? BLANK_LABELS[reason] : null,
        score: s.outcome.kind === 'scored' ? formatHundredths(s.outcome.hundredths) : null,
      };
    }),
  };
}

/**
 * Kế hoạch ghi — MỘT nơi tính, dùng cho cả xem trước lẫn ghi thật (Task 10), nên hai bên không thể bất đồng.
 * Thứ tự kiểm là một phần của hợp đồng: cột → yêu cầu nộp → file/trang tính/cỡ → cổng "đã chốt" → kế hoạch.
 */
@Injectable()
export class GradeExportPlanService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly data: GradeExportDataService,
    private readonly templates: GradeExportService,
  ) {}

  async preview(sessionId: string, dto: PlanDto): Promise<PlanResponse> {
    return toPlanResponse(await this.computePlan(this.ds.manager, sessionId, dto), dto);
  }

  async computePlan(m: EntityManager, sessionId: string, dto: PlanDto): Promise<PlanContext> {
    const columns = [dto.mssvColumn, dto.scoreColumn, ...(dto.reasonColumn ? [dto.reasonColumn] : [])];
    if (new Set(columns).size !== columns.length) throw new BadRequestException(MSG.sameColumns);
    for (const column of columns) {
      if (colToIndex(column) > MAX_COLUMNS) throw new BadRequestException(MSG.columnTooFar(column));
    }

    // Nhiều yêu cầu nộp → giảng viên PHẢI chọn (D7): cộng điểm là quyết định nghiệp vụ, không phải của hệ thống.
    const deliverables = await this.data.deliverables(m, sessionId);
    if (dto.deliverableId && !deliverables.some((d) => d.id === dto.deliverableId)) throw new BadRequestException(MSG.foreignDeliverable);
    if (deliverables.length > 1 && !dto.deliverableId) throw new BadRequestException(MSG.needDeliverable(deliverables.length));
    const deliverableId = deliverables.length > 1 ? (dto.deliverableId ?? null) : null;

    const { workbook, entries } = await this.templates.loadTemplate(sessionId, dto.templateId);
    const info = workbook.sheets.find((s) => s.name === dto.sheetName);
    if (!info) throw new BadRequestException(MSG.noSheet(dto.sheetName));
    const sheet = this.templates.readSheetOrThrow(workbook, dto.sheetName);
    if (sheet.rowCount - dto.firstDataRow + 1 > MAX_DATA_ROWS) throw new BadRequestException(MSG.tooManyRows);

    const mssvCol = colToIndex(dto.mssvColumn);
    const scoreCol = colToIndex(dto.scoreColumn);
    const reasonCol = dto.reasonColumn ? colToIndex(dto.reasonColumn) : null;
    const rows: FileRowInput[] = [];
    for (let row = dto.firstDataRow; row <= sheet.rowCount; row++) {
      rows.push({
        row,
        mssv: fileCell(sheet, mssvCol, row),
        score: fileCell(sheet, scoreCol, row),
        reason: reasonCol === null ? null : fileCell(sheet, reasonCol, row),
      });
    }

    const { students, publishedResults } = await this.data.loadStudents(m, sessionId, deliverableId);
    if (publishedResults === 0) throw new ConflictException(MSG.notFinalized);
    const previous = await this.data.previousWrites(m, sessionId, deliverableId);
    const previousExports = await this.data.previousExportCount(m, sessionId, deliverableId);

    const built = buildPlan({
      firstDataRow: dto.firstDataRow,
      rows,
      students,
      previous,
      roundingStep: dto.roundingStepHundredths,
      hasReasonColumn: reasonCol !== null,
      sheetProtected: sheet.protected,
    });
    const plan = await this.withCauses(m, built, previous);
    return { plan, changes: summarizeChanges(plan.rows, previousExports), deliverableId, entries, sheetPath: info.path };
  }

  /** Điền `causes` cho các dòng đổi so với lần ghi trước — so hai `score_computation.breakdown` theo luật (D15). */
  private async withCauses(m: EntityManager, plan: ExportPlan, previous: ReadonlyMap<string, PreviousWrite>): Promise<ExportPlan> {
    const changed = new Set(plan.rows.filter((r) => r.action === 'write' && (r.direction === 'up' || r.direction === 'down')));
    if (changed.size === 0) return plan;

    const ids = new Set<string>();
    for (const r of changed) {
      if (r.computationId) ids.add(r.computationId);
      const prev = previous.get(r.studentMssv!.toLowerCase());
      if (prev?.computationId) ids.add(prev.computationId);
    }
    const computations = await this.data.computations(m, [...ids]);
    const revisionIds = new Set<string>();
    for (const c of computations.values()) for (const e of c.breakdown.errors) revisionIds.add(e.revisionId);
    const names = await this.data.ruleNames(m, [...revisionIds]);

    const rows = plan.rows.map((r) => {
      if (!changed.has(r)) return r;
      const prev = previous.get(r.studentMssv!.toLowerCase())!;
      const causes = attribute({
        direction: r.direction as 'up' | 'down',
        currentSource: r.source ?? 'none',
        previousWritten: prev.hundredths,
        previousStep: prev.step,
        currentRaw: r.systemHundredths!,
        previousBreakdown: (prev.computationId ? computations.get(prev.computationId)?.breakdown : null) ?? null,
        currentBreakdown: (r.computationId ? computations.get(r.computationId)?.breakdown : null) ?? null,
        ruleNames: names,
      });
      return { ...r, causes };
    });
    return { ...plan, rows };
  }
}
