import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { InspectDto } from './dto/inspect.dto';
import { TemplateUploadDto } from './dto/template-upload.dto';
import { toHttpError } from './grade-export.errors';
import { GradeExportDataService, type DeliverableInfo } from './grade-export.data';
import { buildTemplateKey } from './grade-export.keys';
import { MSG } from './grade-export.messages';
import { MAX_TEMPLATE_BYTES } from './grade-export.types';
import { buildGrid, type InspectGrid } from './inspect-grid';
import { openWorkbook, readSheet, type SheetRead, type Workbook } from './xlsx/workbook-reader';
import { readZipEntries, type ZipEntry } from './xlsx/zip-io';

export interface InspectResponse {
  templateId: string;
  fileSizeBytes: number;
  sheets: { name: string; hidden: boolean }[];
  deliverables: DeliverableInfo[];
  sheet: InspectGrid | null;
}

export interface LoadedTemplate {
  workbook: Workbook;
  entries: ZipEntry[];
  size: number;
}

/**
 * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Quyền sở hữu phiên do
 * controller kiểm TRƯỚC (`findEntityForOwner`); mọi khoá storage dựng lại từ phiên + id, không tin body.
 */
@Injectable()
export class GradeExportService {
  constructor(
    private readonly storage: StorageService,
    private readonly data: GradeExportDataService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Bước 1: một id và một chỗ để đặt byte. Chưa có dòng DB nào — chỉ ghi lúc xuất. */
  async requestTemplateUpload(
    sessionId: string,
    dto: TemplateUploadDto,
  ): Promise<{ templateId: string; storageKey: string; uploadUrl: string; expiresIn: number }> {
    // `dto.fileName` không dựng gì cả; nó chỉ đã được kiểm đuôi. Khoá dựng từ id do server cấp.
    void dto;
    const templateId = randomUUID();
    const storageKey = buildTemplateKey(sessionId, templateId);
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
    return { templateId, storageKey, uploadUrl, expiresIn };
  }

  /**
   * Tải file mẫu từ storage, đo kích thước THẬT bằng HeadObject trước khi tải (số client khai không đáng tin),
   * rồi mở bằng `yauzl` có giới hạn. Mọi lỗi của lớp `.xlsx` thành 400 tiếng Việt.
   */
  async loadTemplate(sessionId: string, templateId: string): Promise<LoadedTemplate> {
    const key = buildTemplateKey(sessionId, templateId);
    const size = await this.storage.getObjectSize(key);
    if (size === null) throw new BadRequestException(MSG.noFile);
    if (size > MAX_TEMPLATE_BYTES) throw new BadRequestException(MSG.tooLarge);
    const buffer = await this.storage.getObject(key);
    try {
      const entries = await readZipEntries(buffer);
      return { workbook: openWorkbook(entries), entries, size };
    } catch (error) {
      throw toHttpError(error);
    }
  }

  readSheetOrThrow(workbook: Workbook, name: string): SheetRead {
    try {
      return readSheet(workbook, name);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async inspect(sessionId: string, dto: InspectDto): Promise<InspectResponse> {
    const { workbook, size } = await this.loadTemplate(sessionId, dto.templateId);
    const deliverables = await this.data.deliverables(this.ds.manager, sessionId);
    const sheets = workbook.sheets.map((s) => ({ name: s.name, hidden: s.hidden }));
    // Chỉ khi file có ĐÚNG MỘT trang tính mới không cần hỏi: chọn trang khác đi là đoán thay giảng viên.
    const chosen = dto.sheetName ?? (sheets.length === 1 ? sheets[0]!.name : null);
    let grid: InspectGrid | null = null;
    if (chosen !== null) {
      if (!sheets.some((s) => s.name === chosen)) throw new BadRequestException(MSG.noSheet(chosen));
      grid = buildGrid(this.readSheetOrThrow(workbook, chosen), dto.fromRow ?? 1);
    }
    return { templateId: dto.templateId, fileSizeBytes: size, sheets, deliverables, sheet: grid };
  }
}
