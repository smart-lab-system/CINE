import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { CourseEntity } from '../master-data/entities/course.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { RoomEntity } from '../master-data/entities/room.entity';
import { ComputerEntity } from '../master-data/entities/computer.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { IdeExtensionEntity } from './entities/ide-extension.entity';
import { IdeExtensionVersionEntity } from './entities/ide-extension-version.entity';
import { IdeExtensionPolicyEntity } from './entities/ide-extension-policy.entity';
import { IdeExtensionPolicyItemEntity } from './entities/ide-extension-policy-item.entity';
import { IdeExtensionScanEntity } from './entities/ide-extension-scan.entity';
import { IdeExtensionScanItemEntity } from './entities/ide-extension-scan-item.entity';
import { IdeExtensionSessionSummaryEntity } from './entities/ide-extension-session-summary.entity';
import { LabMgmtMachineEntity } from './entities/lab-mgmt-machine.entity';
import { LabMgmtSessionEntity } from './entities/lab-mgmt-session.entity';
import { LabRoomProposalEntity } from './entities/lab-room-proposal.entity';
import { LabRoomProposalMachineEntity } from './entities/lab-room-proposal-machine.entity';
import {
  AcceptCreateRoomDto,
  BatchSyncDto,
  CatalogFromScanDto,
  ConfirmArtifactDto,
  CreateCatalogExtensionDto,
  CreateCatalogVersionDto,
  CreateCoursePolicyItemDto,
  CreateRoomProposalDto,
  EffectiveQueryDto,
  EnsureArtifactsDto,
  RejectRoomProposalDto,
  UpdateCatalogExtensionDto,
  VerifyTeacherMachineDto,
} from './dto/ide-extensions.dto';
import { deriveCatalogStatus } from './catalog-status';
import { isViolationPairStillOpen } from './violation-filter';
import { fetchMarketplaceMeta } from './marketplace-client';
import { StorageService } from '../storage/storage.service';
import { IDE_EXTENSION_EXTRACT_QUEUE } from './extract/ide-extension-extract.constants';
import {
  buildNormalizedSourcesFromPackage,
  parsePackageSnippetsContributes,
  SnippetNormalizeError,
} from './normalize/snippet-normalize';
import {
  sanitizeExtractRelativePath,
  UnsafeExtractPathError,
} from './extract/ide-extension-extract-path';
import {
  IDE_EXTENSION_EXTRACT_JOB_OPTIONS,
  type ExtractTreeDocument,
  type IdeExtensionExtractJob,
} from './extract/ide-extension-extract.types';

@Injectable()
export class IdeExtensionsService {
  private readonly logger = new Logger(IdeExtensionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    @InjectQueue(IDE_EXTENSION_EXTRACT_QUEUE)
    private readonly extractQueue: Queue<IdeExtensionExtractJob>,
    @InjectRepository(IdeExtensionEntity)
    private readonly extensions: Repository<IdeExtensionEntity>,
    @InjectRepository(IdeExtensionVersionEntity)
    private readonly versions: Repository<IdeExtensionVersionEntity>,
    @InjectRepository(IdeExtensionPolicyEntity)
    private readonly policies: Repository<IdeExtensionPolicyEntity>,
    @InjectRepository(IdeExtensionPolicyItemEntity)
    private readonly items: Repository<IdeExtensionPolicyItemEntity>,
    @InjectRepository(IdeExtensionScanEntity)
    private readonly scans: Repository<IdeExtensionScanEntity>,
    @InjectRepository(IdeExtensionScanItemEntity)
    private readonly scanItems: Repository<IdeExtensionScanItemEntity>,
    @InjectRepository(IdeExtensionSessionSummaryEntity)
    private readonly summaries: Repository<IdeExtensionSessionSummaryEntity>,
    @InjectRepository(LabMgmtSessionEntity)
    private readonly labSessions: Repository<LabMgmtSessionEntity>,
    @InjectRepository(LabMgmtMachineEntity)
    private readonly labMachines: Repository<LabMgmtMachineEntity>,
    @InjectRepository(LabRoomProposalEntity)
    private readonly roomProposals: Repository<LabRoomProposalEntity>,
    @InjectRepository(LabRoomProposalMachineEntity)
    private readonly roomProposalMachines: Repository<LabRoomProposalMachineEntity>,
    @InjectRepository(RoomEntity)
    private readonly rooms: Repository<RoomEntity>,
    @InjectRepository(ComputerEntity)
    private readonly computers: Repository<ComputerEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ExamSessionEntity)
    private readonly examSessions: Repository<ExamSessionEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
  ) {}

  /**
   * Lookup công khai cho đăng nhập Quản lý (SV chỉ nhập MSSV) — spec §2.3.
   * Chỉ trả trường cần thiết; không JWT.
   */
  async lookupStudentByMssv(rawMssv: string) {
    const mssv = rawMssv.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (mssv.length < 4) {
      throw new BadRequestException('MSSV không hợp lệ.');
    }
    const row = await this.students.findOne({
      where: { mssv },
      relations: { nominalClass: true },
    });
    if (!row) {
      throw new NotFoundException(
        `Không tìm thấy sinh viên với MSSV ${mssv} trong hệ thống.`,
      );
    }
    if (row.status !== 'active') {
      throw new ForbiddenException(
        'Tài khoản sinh viên không còn hiệu lực (không ở trạng thái đang học).',
      );
    }
    return {
      id: row.id,
      mssv: row.mssv,
      fullName: row.fullName,
      status: row.status,
      nominalClass: row.nominalClass
        ? {
            id: row.nominalClass.id,
            code: row.nominalClass.code,
            name: row.nominalClass.name,
          }
        : null,
    };
  }

  // ── Catalog (§7.1a / §9) ──────────────────────────────────────────

  async listCatalog() {
    const rows = await this.extensions.find({
      where: { isActive: true },
      order: { displayName: 'ASC' },
      relations: { versions: true },
    });
    return rows.map((ext) => ({
      ...this.toCatalogDto(ext),
      catalogStatus: deriveCatalogStatus(ext.versions ?? []),
    }));
  }

  async getCatalogDetail(id: string) {
    const ext = await this.extensions.findOne({
      where: { id },
      relations: { versions: true },
    });
    if (!ext) throw new NotFoundException('Không tìm thấy extension trong catalog.');
    const versions = [...(ext.versions ?? [])].sort(
      (a, b) => b.addedAt.getTime() - a.addedAt.getTime(),
    );
    return {
      ...this.toCatalogDto(ext),
      catalogStatus: deriveCatalogStatus(versions),
      versions: versions.map((v) => this.toVersionDto(v)),
    };
  }

  async createCatalogExtension(dto: CreateCatalogExtensionDto) {
    const identifier = dto.identifier.trim();
    if (!identifier.includes('.')) {
      throw new BadRequestException(
        'Identifier phải dạng publisher.name (ví dụ ms-python.python).',
      );
    }
    const existing = await this.extensions.findOne({ where: { identifier } });
    if (existing) {
      throw new BadRequestException(`Extension ${identifier} đã có trong catalog.`);
    }

    const meta = await fetchMarketplaceMeta(identifier);
    const publishedAt = meta?.publishedAt
      ?? (dto.publishedAt ? new Date(dto.publishedAt) : null);
    const lastReleasedAt = meta?.lastReleasedAt
      ?? (dto.lastReleasedAt ? new Date(dto.lastReleasedAt) : null);

    return this.extensions.save(
      this.extensions.create({
        identifier,
        displayName: meta?.displayName ?? dto.displayName.trim(),
        publisher: meta?.publisher ?? dto.publisher.trim(),
        publishedAt,
        lastReleasedAt,
        marketplaceSyncedAt: meta ? new Date() : null,
        isActive: true,
      }),
    );
  }

  async updateCatalogExtension(id: string, dto: UpdateCatalogExtensionDto) {
    const ext = await this.extensions.findOne({ where: { id } });
    if (!ext) throw new NotFoundException('Không tìm thấy extension trong catalog.');
    if (dto.displayName !== undefined) ext.displayName = dto.displayName.trim();
    if (dto.publisher !== undefined) ext.publisher = dto.publisher.trim();
    if (dto.publishedAt !== undefined) {
      ext.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    }
    if (dto.lastReleasedAt !== undefined) {
      ext.lastReleasedAt = dto.lastReleasedAt ? new Date(dto.lastReleasedAt) : null;
    }
    if (dto.isActive !== undefined) ext.isActive = dto.isActive;
    return this.extensions.save(ext);
  }

  async refreshMarketplace(id: string) {
    const ext = await this.extensions.findOne({ where: { id } });
    if (!ext) throw new NotFoundException('Không tìm thấy extension trong catalog.');
    const meta = await fetchMarketplaceMeta(ext.identifier);
    if (!meta) {
      return { ...this.toCatalogDto(ext), refreshed: false as const };
    }
    ext.displayName = meta.displayName;
    ext.publisher = meta.publisher;
    ext.publishedAt = meta.publishedAt;
    ext.lastReleasedAt = meta.lastReleasedAt;
    ext.marketplaceSyncedAt = new Date();
    const saved = await this.extensions.save(ext);
    return { ...this.toCatalogDto(saved), refreshed: true as const };
  }

  async addCatalogVersion(extensionId: string, dto: CreateCatalogVersionDto) {
    const ext = await this.extensions.findOne({ where: { id: extensionId } });
    if (!ext) throw new NotFoundException('Không tìm thấy extension trong catalog.');
    const version = dto.version.trim();
    if (!version) throw new BadRequestException('Thiếu số phiên bản.');
    if (version !== '*' && version.includes('*')) {
      throw new BadRequestException('Chỉ chấp nhận «*» đúng literal hoặc semver cụ thể.');
    }
    const dup = await this.versions.findOne({
      where: { extensionPk: extensionId, version },
    });
    if (dup) {
      throw new BadRequestException(
        version === '*'
          ? 'Đã có cấu hình duyệt mọi phiên bản (*).'
          : `Phiên bản ${version} đã tồn tại.`,
      );
    }
    const now = new Date();
    const row = await this.versions.save(
      this.versions.create({
        extensionPk: extensionId,
        version,
        addedAt: now,
        approvalStatus: 'pending',
        approvedAt: null,
        approvedBy: null,
        note: dto.note ?? null,
      }),
    );
    // Không ghi đè Last Released bằng added_at khi Marketplace đã có ngày; bỏ qua với *.
    if (version !== '*' && !ext.lastReleasedAt) {
      ext.lastReleasedAt = now;
      await this.extensions.save(ext);
    }
    return row;
  }

  /**
   * Upsert từ kết quả quét (§9.4): tạo extension nếu chưa có; thêm version cụ thể nếu mới.
   * Không bao giờ tự tạo `*`.
   */
  async upsertFromScan(dto: CatalogFromScanDto) {
    const extensionId = dto.extensionId.trim();
    if (!extensionId.includes('.')) {
      throw new BadRequestException(
        'Identifier phải dạng publisher.name (ví dụ ms-python.python).',
      );
    }
    const versionRaw = dto.version?.trim();
    if (versionRaw === '*') {
      throw new BadRequestException('Không thể thêm wildcard (*) từ kết quả quét.');
    }

    let ext = await this.extensions.findOne({ where: { identifier: extensionId } });
    let createdExtension = false;
    if (!ext) {
      const meta = await fetchMarketplaceMeta(extensionId);
      const publisherGuess = extensionId.slice(0, extensionId.indexOf('.'));
      ext = await this.extensions.save(
        this.extensions.create({
          identifier: extensionId,
          displayName: meta?.displayName ?? dto.displayName?.trim() ?? extensionId,
          publisher: meta?.publisher ?? publisherGuess,
          publishedAt: meta?.publishedAt ?? null,
          lastReleasedAt: meta?.lastReleasedAt ?? null,
          marketplaceSyncedAt: meta ? new Date() : null,
          isActive: true,
        }),
      );
      createdExtension = true;
    } else {
      // Best-effort refresh dates nếu chưa sync.
      if (!ext.marketplaceSyncedAt) {
        await this.applyMarketplaceMeta(ext);
      }
    }

    let createdVersion = false;
    let alreadyExists = false;
    let versionRow: IdeExtensionVersionEntity | null = null;

    if (versionRaw) {
      const existingVer = await this.versions.findOne({
        where: { extensionPk: ext.id, version: versionRaw },
      });
      if (existingVer) {
        alreadyExists = true;
        versionRow = existingVer;
      } else {
        versionRow = await this.versions.save(
          this.versions.create({
            extensionPk: ext.id,
            version: versionRaw,
            addedAt: new Date(),
            approvalStatus: 'pending',
            approvedAt: null,
            approvedBy: null,
            note: null,
          }),
        );
        createdVersion = true;
      }
    }

    return {
      extension: this.toCatalogDto(ext),
      version: versionRow,
      createdExtension,
      createdVersion,
      alreadyExists,
    };
  }

  async approveVersion(versionId: string, accountId: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    row.approvalStatus = 'approved';
    row.approvedAt = new Date();
    row.approvedBy = accountId;
    return this.versions.save(row);
  }

  async unapproveVersion(versionId: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    row.approvalStatus = 'pending';
    row.approvedAt = null;
    row.approvedBy = null;
    return this.versions.save(row);
  }

  async deleteVersion(versionId: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    await this.versions.remove(row);
  }

  /**
   * Hub sync: upsert thiếu catalog version (pending), trả presigned PUT
   * chỉ khi chưa có binary trên Storage (điều kiện 1B).
   *
   * `version === '*'` bị bỏ qua từng item — không vào `needed`, không đếm
   * vào `skipped` (skipped = đã có object).
   */
  async ensureArtifacts(dto: EnsureArtifactsDto) {
    const deduped = new Map<
      string,
      { extensionId: string; version: string; displayName?: string }
    >();
    for (const raw of dto.items ?? []) {
      const extensionId = raw.extensionId?.trim() ?? '';
      const version = raw.version?.trim() ?? '';
      if (!extensionId || !version) continue;
      // Wildcard never has a VSIX artifact — drop silently per plan.
      if (version === '*') continue;
      const key = `${extensionId}\0${version}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          extensionId,
          version,
          displayName: raw.displayName?.trim() || undefined,
        });
      }
    }

    const needed: Array<{
      versionId: string;
      extensionId: string;
      version: string;
      storageKey: string;
      uploadUrl: string;
      expiresIn: number;
    }> = [];
    let skipped = 0;

    for (const item of deduped.values()) {
      const upserted = await this.upsertFromScan({
        extensionId: item.extensionId,
        version: item.version,
        displayName: item.displayName,
      });
      const versionRow = upserted.version;
      if (!versionRow) {
        continue;
      }

      if (versionRow.storageKey && (await this.storage.objectExists(versionRow.storageKey))) {
        skipped += 1;
        continue;
      }

      const storageKey = this.storage.buildIdeExtensionKey(
        versionRow.extensionPk,
        versionRow.id,
      );
      const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
      needed.push({
        versionId: versionRow.id,
        extensionId: upserted.extension.identifier,
        version: versionRow.version,
        storageKey,
        uploadUrl,
        expiresIn,
      });
    }

    return { needed, skipped };
  }

  async confirmArtifact(versionId: string, dto: ConfirmArtifactDto) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');

    const expectedKey = this.storage.buildIdeExtensionKey(row.extensionPk, row.id);
    if (dto.storageKey !== expectedKey) {
      throw new BadRequestException('Storage key does not match this version.');
    }
    if (!(await this.storage.objectExists(expectedKey))) {
      throw new BadRequestException(
        'Chưa thấy file trên kho lưu trữ — hãy tải lên trước rồi xác nhận.',
      );
    }

    row.storageKey = expectedKey;
    row.artifactSha256 = dto.sha256?.trim() || row.artifactSha256;
    row.artifactSizeBytes =
      dto.sizeBytes !== undefined ? String(dto.sizeBytes) : row.artifactSizeBytes;
    row.artifactUploadedAt = new Date();
    // Re-confirm clears prior extract so Worker rebuilds from the new object.
    row.extractStatus = 'pending';
    row.extractError = null;
    row.extractTreeKey = null;
    row.extractEntryCount = null;
    row.extractTotalBytes = null;
    row.extractStartedAt = null;
    row.extractFinishedAt = null;
    const saved = await this.versions.save(row);
    await this.enqueueExtract(saved.id);
    return this.toVersionDto(saved);
  }

  async browseVersion(versionId: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    if (!row.storageKey) {
      throw new BadRequestException('Phiên bản chưa có file .vsix trên kho lưu trữ.');
    }

    const base = {
      status: row.extractStatus,
      entryCount: row.extractEntryCount,
      error: row.extractError,
      artifact: {
        storageKey: row.storageKey,
        artifactSha256: row.artifactSha256,
        artifactSizeBytes: row.artifactSizeBytes,
        artifactUploadedAt: row.artifactUploadedAt,
      },
    };

    if (row.extractStatus !== 'ready' || !row.extractTreeKey) {
      return { ...base, tree: null as ExtractTreeDocument | null };
    }

    try {
      const raw = await this.storage.getObject(row.extractTreeKey);
      const tree = JSON.parse(raw.toString('utf8')) as ExtractTreeDocument;
      return { ...base, tree };
    } catch (error) {
      this.logger.warn(
        `browse ${versionId}: không đọc được tree.json — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        'Không đọc được cây thư mục đã giải nén. Hãy thử giải nén lại.',
      );
    }
  }

  async browseVersionFile(versionId: string, rawPath: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    if (!row.storageKey) {
      throw new BadRequestException('Phiên bản chưa có file .vsix trên kho lưu trữ.');
    }
    if (row.extractStatus !== 'ready') {
      throw new BadRequestException('Chưa giải nén xong — chưa thể xem file.');
    }

    let relativePath: string;
    try {
      relativePath = sanitizeExtractRelativePath(rawPath);
    } catch (error) {
      if (error instanceof UnsafeExtractPathError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    let key: string;
    try {
      key = this.storage.buildIdeExtensionExtractedFileKey(
        row.extensionPk,
        row.id,
        relativePath,
      );
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw new BadRequestException('Đường dẫn file không hợp lệ.');
      }
      throw error;
    }

    if (!(await this.storage.objectExists(key))) {
      throw new NotFoundException('Không tìm thấy file đã giải nén.');
    }

    const filename = relativePath.split('/').pop() || 'file';
    const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(key, {
      filename,
    });
    const size = await this.storage.getObjectSize(key);
    return { downloadUrl, expiresIn, path: relativePath, size };
  }

  async requestExtract(versionId: string) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    if (!row.storageKey) {
      throw new BadRequestException('Phiên bản chưa có file .vsix trên kho lưu trữ.');
    }
    if (row.extractStatus === 'pending' || row.extractStatus === 'extracting') {
      return this.toVersionDto(row);
    }
    if (row.extractStatus === 'ready') {
      return this.toVersionDto(row);
    }

    row.extractStatus = 'pending';
    row.extractError = null;
    row.extractStartedAt = null;
    row.extractFinishedAt = null;
    const saved = await this.versions.save(row);
    await this.enqueueExtract(saved.id);
    return this.toVersionDto(saved);
  }

  /**
   * On-demand Snippets-first normalize: read extracted package.json +
   * contributes.snippets bodies. Does not persist synthetic files.
   */
  async getNormalizedSources(versionId: string, opts?: { raw?: boolean }) {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản.');
    if (!row.storageKey) {
      throw new BadRequestException('Phiên bản chưa có file .vsix trên kho lưu trữ.');
    }
    if (row.extractStatus !== 'ready') {
      throw new BadRequestException(
        'Chưa giải nén xong — hãy đợi extract ready rồi xem mã đã chuẩn hóa.',
      );
    }

    const packageKey = this.storage.buildIdeExtensionExtractedFileKey(
      row.extensionPk,
      row.id,
      'extension/package.json',
    );
    if (!(await this.storage.objectExists(packageKey))) {
      throw new BadRequestException(
        'Không tìm thấy extension/package.json trong bản giải nén.',
      );
    }

    let packageBuf: Buffer;
    try {
      packageBuf = await this.storage.getObject(packageKey);
    } catch (error) {
      this.logger.warn(
        `normalized-sources ${versionId}: get package.json — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Không đọc được extension/package.json.');
    }

    const packageText = packageBuf.toString('utf8');
    let packageJson: unknown;
    try {
      packageJson = JSON.parse(packageText);
    } catch {
      throw new BadRequestException('Không parse được extension/package.json.');
    }

    let contributes;
    try {
      ({ contributes } = parsePackageSnippetsContributes(packageJson));
    } catch (error) {
      if (error instanceof SnippetNormalizeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const fileMap = new Map<string, Buffer>();
    for (const ref of contributes) {
      if (fileMap.has(ref.path)) continue;
      const key = this.storage.buildIdeExtensionExtractedFileKey(
        row.extensionPk,
        row.id,
        ref.path,
      );
      if (!(await this.storage.objectExists(key))) {
        throw new BadRequestException(`Không tìm thấy file snippet: ${ref.path}`);
      }
      fileMap.set(ref.path, await this.storage.getObject(key));
    }

    try {
      return buildNormalizedSourcesFromPackage(
        packageText,
        (relativePath) => {
          const buf = fileMap.get(relativePath);
          if (!buf) {
            throw new SnippetNormalizeError(`Thiếu file snippet: ${relativePath}`);
          }
          return buf;
        },
        { stripTabstops: !opts?.raw },
      );
    } catch (error) {
      if (error instanceof SnippetNormalizeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async enqueueExtract(versionId: string): Promise<void> {
    const jobId = `extract-${versionId}`;
    try {
      const existing = await this.extractQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          this.logger.debug(`extract job already ${state} for ${versionId}`);
          return;
        }
        await existing.remove();
      }
      await this.extractQueue.add(
        'extract',
        { versionId },
        {
          ...IDE_EXTENSION_EXTRACT_JOB_OPTIONS,
          jobId,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|exist|duplicate/i.test(message)) {
        this.logger.debug(`extract job already queued for ${versionId}`);
        return;
      }
      this.logger.error(`enqueue extract ${versionId} failed: ${message}`);
      throw error;
    }
  }

  private toVersionDto(v: IdeExtensionVersionEntity) {
    return {
      id: v.id,
      extensionPk: v.extensionPk,
      version: v.version,
      addedAt: v.addedAt,
      approvalStatus: v.approvalStatus,
      approvedAt: v.approvedAt,
      approvedBy: v.approvedBy,
      note: v.note,
      storageKey: v.storageKey ?? null,
      artifactSha256: v.artifactSha256 ?? null,
      artifactSizeBytes: v.artifactSizeBytes ?? null,
      artifactUploadedAt: v.artifactUploadedAt ?? null,
      extractStatus: v.extractStatus ?? 'none',
      extractError: v.extractError ?? null,
      extractEntryCount: v.extractEntryCount ?? null,
    };
  }

  private toCatalogDto(ext: IdeExtensionEntity) {
    return {
      id: ext.id,
      identifier: ext.identifier,
      displayName: ext.displayName,
      publisher: ext.publisher,
      publishedAt: ext.publishedAt,
      lastReleasedAt: ext.lastReleasedAt,
      marketplaceSyncedAt: ext.marketplaceSyncedAt ?? null,
      isActive: ext.isActive,
      createdAt: ext.createdAt,
      updatedAt: ext.updatedAt,
    };
  }

  private async applyMarketplaceMeta(ext: IdeExtensionEntity): Promise<void> {
    const meta = await fetchMarketplaceMeta(ext.identifier);
    if (!meta) return;
    ext.displayName = meta.displayName;
    ext.publisher = meta.publisher;
    ext.publishedAt = meta.publishedAt;
    ext.lastReleasedAt = meta.lastReleasedAt;
    ext.marketplaceSyncedAt = new Date();
    await this.extensions.save(ext);
  }

  async ensureCoursePolicy(courseId: string): Promise<IdeExtensionPolicyEntity> {
    let policy = await this.policies.findOne({
      where: { scopeType: 'course', courseId, isActive: true },
    });
    if (!policy) {
      policy = await this.policies.save(
        this.policies.create({
          scopeType: 'course',
          courseId,
          name: `Allowlist môn ${courseId}`,
          isActive: true,
        }),
      );
    }
    return policy;
  }

  async listCourseItems(courseId: string) {
    const policy = await this.ensureCoursePolicy(courseId);
    return this.items.find({
      where: { policyId: policy.id },
      order: { extensionId: 'ASC' },
    });
  }

  async addCourseItem(dto: CreateCoursePolicyItemDto, accountId: string) {
    const policy = await this.ensureCoursePolicy(dto.courseId);
    return this.items.save(
      this.items.create({
        policyId: policy.id,
        extensionId: dto.extensionId.trim(),
        displayName: dto.displayName ?? null,
        minVersion: dto.minVersion ?? null,
        maxVersion: dto.maxVersion ?? null,
        note: dto.note ?? null,
        approvalStatus: 'pending',
        requestedBy: accountId,
      }),
    );
  }

  async setItemApproval(
    itemId: string,
    status: 'approved' | 'rejected',
    reviewerId: string,
  ) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Không tìm thấy extension trong policy.');
    item.approvalStatus = status;
    item.reviewedBy = reviewerId;
    item.reviewedAt = new Date();
    return this.items.save(item);
  }

  async removeItem(itemId: string) {
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Không tìm thấy extension trong policy.');
    await this.items.remove(item);
  }

  async resolveCourseId(query: EffectiveQueryDto): Promise<{
    courseId: string | null;
    warning?: string;
  }> {
    if (query.courseId) {
      return { courseId: query.courseId };
    }
    if (!query.examSessionId) {
      return {
        courseId: null,
        warning: 'Chưa chọn môn — chỉ áp dụng allowlist toàn trường (global).',
      };
    }
    const session = await this.examSessions.findOne({
      where: { id: query.examSessionId },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên thi.');
    }
    const klass = await this.classes.findOne({ where: { id: session.classId } });
    if (!klass?.courseId) {
      return {
        courseId: null,
        warning: 'Lớp phiên thi chưa gắn catalog môn — chỉ áp dụng global.',
      };
    }
    return { courseId: klass.courseId };
  }

  /**
   * Spec §6.1a: global = wildcard (*) hoặc exact version; course = match any version của extension_id.
   */
  async getEffective(query: EffectiveQueryDto) {
    const { courseId, warning } = await this.resolveCourseId(query);
    const items: Array<{
      extensionId: string;
      scope: 'global' | 'course';
      displayName: string | null;
      match: 'wildcard' | 'exact' | 'any';
      version?: string | null;
    }> = [];

    const approvedVersions = await this.versions.find({
      where: { approvalStatus: 'approved' },
      relations: { extension: true },
    });

    // Wildcard thắng: nếu có * approved thì chỉ emit một rule wildcard / extension.
    const wildcardIds = new Set<string>();
    for (const v of approvedVersions) {
      const ext = v.extension;
      if (!ext?.isActive || v.version !== '*') continue;
      wildcardIds.add(ext.identifier);
      items.push({
        extensionId: ext.identifier,
        scope: 'global',
        displayName: ext.displayName,
        match: 'wildcard',
        version: '*',
      });
    }

    for (const v of approvedVersions) {
      const ext = v.extension;
      if (!ext?.isActive || v.version === '*') continue;
      if (wildcardIds.has(ext.identifier)) continue;
      items.push({
        extensionId: ext.identifier,
        scope: 'global',
        displayName: ext.displayName,
        match: 'exact',
        version: v.version,
      });
    }

    if (courseId) {
      const coursePolicy = await this.policies.findOne({
        where: { scopeType: 'course', courseId, isActive: true },
      });
      if (coursePolicy) {
        const courseItems = await this.items.find({
          where: { policyId: coursePolicy.id, approvalStatus: 'approved' },
        });
        for (const it of courseItems) {
          // Global đã cover (wildcard hoặc bất kỳ exact) vẫn có thể thêm course;
          // compare ưu tiên global khi cả hai khớp.
          items.push({
            extensionId: it.extensionId,
            scope: 'course',
            displayName: it.displayName,
            match: 'any',
            version: null,
          });
        }
      }
    }

    return { courseId, warning, items };
  }

  async listScans(labMgmtSessionId?: string, courseId?: string) {
    const qb = this.scans.createQueryBuilder('s').orderBy('s.scanned_at', 'DESC').take(200);
    if (labMgmtSessionId) {
      qb.andWhere('s.lab_mgmt_session_id = :labMgmtSessionId', { labMgmtSessionId });
    }
    if (courseId) {
      qb.andWhere('s.course_id = :courseId', { courseId });
    }
    return qb.getMany();
  }

  async getScanWithItems(scanId: string) {
    const scan = await this.scans.findOne({ where: { id: scanId } });
    if (!scan) throw new NotFoundException('Không tìm thấy bản quét.');
    const items = await this.scanItems.find({
      where: { scanId },
      order: { extensionId: 'ASC' },
    });
    return { ...scan, items };
  }

  /**
   * Spec 2026-11-18: blocked scan items still open under global catalog approval (2B).
   */
  async listViolations() {
    const blocked = await this.scanItems.find({
      where: { verdict: 'blocked' },
      relations: { scan: { examSession: true } },
      order: { extensionId: 'ASC' },
    });

    const approvedVersions = await this.versions.find({
      where: { approvalStatus: 'approved' },
      relations: { extension: true },
    });
    const approvedPairs = approvedVersions
      .filter((v) => v.extension?.identifier)
      .map((v) => ({ identifier: v.extension.identifier, version: v.version }));

    const openItems = blocked.filter((it) =>
      isViolationPairStillOpen(it.extensionId, it.version, approvedPairs),
    );
    if (openItems.length === 0) return [];

    const mssvs = [...new Set(openItems.map((it) => it.scan.studentMssv))];
    const courseIds = [
      ...new Set(
        openItems
          .map((it) => it.scan.courseId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    const [studentRows, courseRows, catalogExts] = await Promise.all([
      mssvs.length
        ? this.students.find({ where: { mssv: In(mssvs) } })
        : Promise.resolve([] as StudentEntity[]),
      courseIds.length
        ? this.dataSource.getRepository(CourseEntity).find({ where: { id: In(courseIds) } })
        : Promise.resolve([] as CourseEntity[]),
      this.extensions.find({
        where: {
          identifier: In([...new Set(openItems.map((it) => it.extensionId))]),
        },
      }),
    ]);

    const studentByMssv = new Map(studentRows.map((s) => [s.mssv.toLowerCase(), s]));
    const courseById = new Map(courseRows.map((c) => [c.id, c]));
    const catalogByIdentifier = new Map(catalogExts.map((e) => [e.identifier, e]));

    type Incident = {
      scanId: string;
      scanItemId: string;
      examSessionId: string | null;
      examSessionName: string | null;
      courseId: string | null;
      courseName: string | null;
      studentMssv: string;
      studentFullName: string | null;
      machineId: string;
      machineName: string | null;
      scannedAt: string;
    };

    const byExt = new Map<
      string,
      {
        extensionId: string;
        displayName: string | null;
        versions: Map<string, { version: string | null; incidents: Incident[] }>;
      }
    >();

    for (const it of openItems) {
      const scan = it.scan;
      const exam = scan.examSession;
      const course =
        (scan.courseId ? courseById.get(scan.courseId) : undefined) ?? null;
      const student = studentByMssv.get(scan.studentMssv.toLowerCase()) ?? null;
      const catalog = catalogByIdentifier.get(it.extensionId);

      const incident: Incident = {
        scanId: scan.id,
        scanItemId: it.id,
        examSessionId: scan.examSessionId,
        examSessionName: exam?.name ?? null,
        courseId: scan.courseId,
        courseName: course?.name ?? exam?.courseName ?? null,
        studentMssv: scan.studentMssv,
        studentFullName: student?.fullName ?? null,
        machineId: scan.machineId,
        machineName: scan.machineName,
        scannedAt: scan.scannedAt.toISOString(),
      };

      let ext = byExt.get(it.extensionId);
      if (!ext) {
        ext = {
          extensionId: it.extensionId,
          displayName: it.displayName ?? catalog?.displayName ?? null,
          versions: new Map(),
        };
        byExt.set(it.extensionId, ext);
      } else if (!ext.displayName && (it.displayName || catalog?.displayName)) {
        ext.displayName = it.displayName ?? catalog?.displayName ?? null;
      }

      const versionKey = it.version ?? '';
      let ver = ext.versions.get(versionKey);
      if (!ver) {
        ver = { version: it.version, incidents: [] };
        ext.versions.set(versionKey, ver);
      }
      ver.incidents.push(incident);
    }

    const result = [...byExt.values()].map((ext) => {
      const catalog = catalogByIdentifier.get(ext.extensionId);
      const publisher =
        catalog?.publisher ??
        (ext.extensionId.includes('.')
          ? ext.extensionId.slice(0, ext.extensionId.indexOf('.'))
          : null);

      const versions = [...ext.versions.values()]
        .map((v) => {
          const incidents = [...v.incidents].sort((a, b) =>
            a.scannedAt < b.scannedAt ? 1 : a.scannedAt > b.scannedAt ? -1 : 0,
          );
          return {
            version: v.version,
            incidentCount: incidents.length,
            incidents,
          };
        })
        .sort((a, b) => {
          if (a.version == null && b.version == null) return 0;
          if (a.version == null) return 1;
          if (b.version == null) return -1;
          return a.version.localeCompare(b.version);
        });

      const allIncidents = versions.flatMap((v) => v.incidents);
      const studentCount = new Set(allIncidents.map((i) => i.studentMssv.toLowerCase())).size;

      return {
        extensionId: ext.extensionId,
        displayName: ext.displayName ?? catalog?.displayName ?? null,
        publisher,
        inCatalog: Boolean(catalog),
        catalogExtensionPk: catalog?.id ?? null,
        versionCount: versions.length,
        incidentCount: allIncidents.length,
        studentCount,
        versions,
      };
    });

    result.sort((a, b) => a.extensionId.localeCompare(b.extensionId));
    return result;
  }

  async syncBatch(dto: BatchSyncDto, callerAccountId: string) {
    if (!dto.labMgmtSessionId) {
      throw new BadRequestException('Thiếu labMgmtSessionId.');
    }
    const teacherId = dto.teacherAccountId ?? callerAccountId;

    return this.dataSource.transaction(async (manager) => {
      let session = await manager.findOne(LabMgmtSessionEntity, {
        where: { id: dto.labMgmtSessionId },
      });
      if (!session) {
        session = manager.create(LabMgmtSessionEntity, {
          id: dto.labMgmtSessionId,
          teacherAccountId: teacherId,
          courseId: dto.courseId ?? null,
          examSessionId: dto.examSessionId ?? null,
          startedAt: new Date(),
        });
        await manager.save(session);
      } else {
        session.courseId = dto.courseId ?? session.courseId;
        session.examSessionId = dto.examSessionId ?? session.examSessionId;
        await manager.save(session);
      }

      if (dto.machines?.length) {
        for (const m of dto.machines) {
          let row = await manager.findOne(LabMgmtMachineEntity, {
            where: {
              labMgmtSessionId: dto.labMgmtSessionId,
              machineId: m.machineId,
            },
          });
          if (!row) {
            row = manager.create(LabMgmtMachineEntity, {
              labMgmtSessionId: dto.labMgmtSessionId,
              machineId: m.machineId,
              role: m.role,
              hostname: m.hostname,
              localIp: m.localIp,
              studentMssv: m.studentMssv ?? null,
              lastSeenAt: new Date(m.lastSeenAt),
            });
          } else {
            row.hostname = m.hostname;
            row.localIp = m.localIp;
            row.studentMssv = m.studentMssv ?? null;
            row.lastSeenAt = new Date(m.lastSeenAt);
            row.role = m.role;
          }
          await manager.save(row);
        }
      }

      let machinesWithViolations = 0;
      for (const scanDto of dto.scans) {
        let scan = await manager.findOne(IdeExtensionScanEntity, {
          where: {
            labMgmtSessionId: dto.labMgmtSessionId,
            studentMssv: scanDto.studentMssv,
          },
        });
        if (!scan) {
          scan = manager.create(IdeExtensionScanEntity, {
            labMgmtSessionId: dto.labMgmtSessionId,
            courseId: dto.courseId ?? null,
            examSessionId: dto.examSessionId ?? null,
            studentMssv: scanDto.studentMssv,
            machineId: scanDto.machineId,
            machineName: scanDto.machineName ?? null,
            scannedAt: new Date(scanDto.scannedAt),
            reportedBy: 'teacher_hub',
            teacherAccountId: teacherId,
            extensionCount: scanDto.extensionCount,
            violationCount: scanDto.violationCount,
            status: scanDto.status,
          });
        } else {
          scan.machineId = scanDto.machineId;
          scan.machineName = scanDto.machineName ?? null;
          scan.scannedAt = new Date(scanDto.scannedAt);
          scan.extensionCount = scanDto.extensionCount;
          scan.violationCount = scanDto.violationCount;
          scan.status = scanDto.status;
          scan.courseId = dto.courseId ?? scan.courseId;
          await manager.delete(IdeExtensionScanItemEntity, { scanId: scan.id });
        }
        scan = await manager.save(scan);
        if (scan.violationCount > 0) machinesWithViolations += 1;

        for (const it of scanDto.items) {
          await manager.save(
            manager.create(IdeExtensionScanItemEntity, {
              scanId: scan.id,
              extensionId: it.extensionId,
              displayName: it.displayName ?? null,
              version: it.version ?? null,
              verdict: it.verdict,
              matchedScope: it.matchedScope ?? null,
              isBuiltin: it.isBuiltin ?? false,
            }),
          );
        }
      }

      let summary = await manager.findOne(IdeExtensionSessionSummaryEntity, {
        where: { labMgmtSessionId: dto.labMgmtSessionId },
      });
      if (!summary) {
        summary = manager.create(IdeExtensionSessionSummaryEntity, {
          labMgmtSessionId: dto.labMgmtSessionId,
          machinesScanned: dto.scans.length,
          machinesWithViolations,
          effectiveExtensionCount: dto.effectiveExtensionCount ?? 0,
          lastSyncedAt: new Date(),
        });
      } else {
        summary.machinesScanned = dto.scans.length;
        summary.machinesWithViolations = machinesWithViolations;
        summary.effectiveExtensionCount = dto.effectiveExtensionCount ?? 0;
        summary.lastSyncedAt = new Date();
      }
      await manager.save(summary);

      return { ok: true as const, labMgmtSessionId: dto.labMgmtSessionId };
    });
  }

  // ── Room proposals (§5.1 / §7.4) ──────────────────────────────────

  async createRoomProposal(dto: CreateRoomProposalDto, accountId: string) {
    if (!dto.machines?.length) {
      throw new BadRequestException('Đề xuất phải kèm ít nhất một máy (Hub hoặc SV).');
    }
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản người gửi.');

    return this.dataSource.transaction(async (manager) => {
      const proposal = await manager.save(
        manager.create(LabRoomProposalEntity, {
          status: 'pending',
          code: dto.code.trim(),
          name: dto.name.trim(),
          capacity: dto.capacity,
          building: dto.building?.trim() || null,
          floor: dto.floor?.trim() || null,
          proposedByAccountId: account.id,
          proposedByEmail: account.email,
          proposedByDisplayName: account.name ?? null,
          labMgmtSessionId: dto.labMgmtSessionId ?? null,
          machineCount: dto.machines.length,
          note: dto.note ?? null,
        }),
      );

      const machines: LabRoomProposalMachineEntity[] = [];
      let sortOrder = 0;
      for (const m of dto.machines) {
        machines.push(
          await manager.save(
            manager.create(LabRoomProposalMachineEntity, {
              proposalId: proposal.id,
              machineId: m.machineId,
              hostname: m.hostname.trim(),
              cpu: m.cpu.trim(),
              ramGb: m.ramGb,
              storage: m.storage.trim(),
              gpu: m.gpu?.trim() || null,
              os: m.os.trim(),
              localIp: m.localIp.trim(),
              macAddress: m.macAddress.trim(),
              status: m.status,
              studentMssv: m.studentMssv ?? null,
              studentFullName: m.studentFullName ?? null,
              role: m.role,
              lastSeenAt: m.lastSeenAt ? new Date(m.lastSeenAt) : null,
              sortOrder: sortOrder++,
            }),
          ),
        );
      }

      // Trả từ trong transaction — không gọi getRoomProposal (repo ngoài) kẻo
      // isolation READ COMMITTED không thấy row chưa commit → 404 giả.
      return { ...proposal, machines };
    });
  }

  async listRoomProposals(status?: string) {
    const qb = this.roomProposals
      .createQueryBuilder('p')
      .orderBy('p.created_at', 'DESC')
      .take(200);
    if (status) {
      qb.andWhere('p.status = :status', { status });
    }
    return qb.getMany();
  }

  async getRoomProposal(id: string) {
    const proposal = await this.roomProposals.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Không tìm thấy đề xuất phòng.');
    const machines = await this.roomProposalMachines.find({
      where: { proposalId: id },
      order: { sortOrder: 'ASC' },
    });
    return { ...proposal, machines };
  }

  async rejectRoomProposal(id: string, reviewerId: string, dto: RejectRoomProposalDto) {
    const proposal = await this.roomProposals.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Không tìm thấy đề xuất phòng.');
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Chỉ từ chối được đề xuất đang chờ duyệt.');
    }
    proposal.status = 'rejected';
    proposal.reviewedBy = reviewerId;
    proposal.reviewedAt = new Date();
    if (dto.note !== undefined) proposal.note = dto.note;
    await this.roomProposals.save(proposal);
    return this.getRoomProposal(id);
  }

  async withdrawRoomProposal(id: string, accountId: string) {
    const proposal = await this.roomProposals.findOne({ where: { id } });
    if (!proposal) throw new NotFoundException('Không tìm thấy đề xuất phòng.');
    if (proposal.proposedByAccountId !== accountId) {
      throw new ForbiddenException('Chỉ người gửi mới rút được đề xuất của mình.');
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Chỉ rút được đề xuất đang chờ duyệt.');
    }
    proposal.status = 'withdrawn';
    await this.roomProposals.save(proposal);
    return this.getRoomProposal(id);
  }

  private computerIdentityMatch(
    pc: { agentMachineId: string | null; hostname: string; macAddress: string | null },
    machineId: string,
    host: string | null,
    mac: string | null,
  ): boolean {
    if (pc.agentMachineId != null && pc.agentMachineId === machineId) return true;
    if (
      host &&
      mac &&
      pc.hostname.toLowerCase() === host &&
      (pc.macAddress?.trim().toLowerCase() ?? '') === mac
    ) {
      return true;
    }
    return false;
  }

  private async findComputersByIdentity(
    machineId: string,
    host: string | null,
    mac: string | null,
  ) {
    const qb = this.computers
      .createQueryBuilder('c')
      .where('c.agent_machine_id = :machineId', { machineId });
    if (host && mac) {
      qb.orWhere(
        'LOWER(c.hostname) = :host AND LOWER(COALESCE(c.mac_address, \'\')) = :mac',
        { host, mac },
      );
    }
    return qb.getMany();
  }

  private teacherMachineView(pc: {
    id: string;
    hostname: string;
    agentMachineId: string | null;
    roomId: string;
  }) {
    return {
      id: pc.id,
      hostname: pc.hostname,
      agentMachineId: pc.agentMachineId,
      roomId: pc.roomId,
    };
  }

  /**
   * Công khai — agent Quyết định vào form GV hay SV khi mở Quản lý.
   * teacher: máy GV, hoặc máy thuộc phòng chưa có máy GV (bootstrap).
   * student: máy catalog không phải GV và phòng đã có máy GV.
   */
  async resolveMachineRole(dto: VerifyTeacherMachineDto) {
    const machineId = dto.machineId?.trim();
    if (!machineId) {
      throw new BadRequestException('Thiếu machineId.');
    }
    const mac = dto.macAddress?.trim().toLowerCase() || null;
    const host = dto.hostname?.trim().toLowerCase() || null;
    const matches = await this.findComputersByIdentity(machineId, host, mac);
    if (matches.length === 0) {
      return {
        role: 'unknown' as const,
        reason: 'not_in_catalog' as const,
        roomId: null,
        computerId: null,
      };
    }

    const asTeacher = matches.find((pc) => pc.isTeacherMachine);
    if (asTeacher) {
      return {
        role: 'teacher' as const,
        reason: 'teacher_machine' as const,
        roomId: asTeacher.roomId,
        computerId: asTeacher.id,
      };
    }

    const pc = matches[0];
    const roomTeacher = await this.computers.findOne({
      where: { roomId: pc.roomId, isTeacherMachine: true },
    });
    if (!roomTeacher) {
      return {
        role: 'teacher' as const,
        reason: 'room_has_no_teacher_machine' as const,
        roomId: pc.roomId,
        computerId: pc.id,
      };
    }
    return {
      role: 'student' as const,
      reason: 'student_machine' as const,
      roomId: pc.roomId,
      computerId: pc.id,
    };
  }

  /**
   * Spec 2026-11-18:
   * - Không có roomId (login): phải là máy GV, hoặc máy thuộc phòng chưa có máy GV.
   * - Có roomId: nếu phòng đã có máy GV → phải khớp; chưa có → ok.
   */
  async verifyTeacherMachine(dto: VerifyTeacherMachineDto) {
    const machineId = dto.machineId?.trim();
    if (!machineId) {
      throw new BadRequestException('Thiếu machineId.');
    }
    const mac = dto.macAddress?.trim().toLowerCase() || null;
    const host = dto.hostname?.trim().toLowerCase() || null;
    const roomId = dto.roomId?.trim() || null;

    if (!roomId) {
      const matches = await this.findComputersByIdentity(machineId, host, mac);
      const asTeacher = matches.find((pc) => pc.isTeacherMachine);
      if (asTeacher) {
        return {
          ok: true,
          reason: 'matched' as const,
          teacherMachine: this.teacherMachineView(asTeacher),
        };
      }
      for (const pc of matches) {
        const roomTeacher = await this.computers.findOne({
          where: { roomId: pc.roomId, isTeacherMachine: true },
        });
        if (!roomTeacher) {
          return {
            ok: true,
            reason: 'room_has_no_teacher_machine' as const,
            teacherMachine: this.teacherMachineView(pc),
          };
        }
      }
      return {
        ok: false,
        reason: 'not_teacher_machine' as const,
        teacherMachine: null,
      };
    }

    const teacherPc = await this.computers.findOne({
      where: { roomId, isTeacherMachine: true },
    });
    if (!teacherPc) {
      return {
        ok: true,
        reason: 'room_has_no_teacher_machine' as const,
        teacherMachine: null,
      };
    }

    if (this.computerIdentityMatch(teacherPc, machineId, host, mac)) {
      return {
        ok: true,
        reason: 'matched' as const,
        teacherMachine: this.teacherMachineView(teacherPc),
      };
    }

    return {
      ok: false,
      reason: 'not_teacher_machine' as const,
      teacherMachine: this.teacherMachineView(teacherPc),
    };
  }

  async acceptCreateRoom(id: string, reviewerId: string, dto: AcceptCreateRoomDto) {
    const detail = await this.getRoomProposal(id);
    if (detail.status !== 'pending') {
      throw new BadRequestException('Chỉ chấp nhận được đề xuất đang chờ duyệt.');
    }

    const code = (dto.code ?? detail.code).trim();
    const existing = await this.rooms.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException(`Mã phòng «${code}» đã tồn tại — hãy đổi mã trước khi tạo.`);
    }

    return this.dataSource.transaction(async (manager) => {
      const room = await manager.save(
        manager.create(RoomEntity, {
          code,
          name: (dto.name ?? detail.name).trim(),
          capacity: dto.capacity ?? detail.capacity,
          building:
            dto.building !== undefined
              ? dto.building?.trim() || null
              : detail.building,
          floor: dto.floor !== undefined ? dto.floor?.trim() || null : detail.floor,
          status: 'active',
        }),
      );

      for (const m of detail.machines) {
        await manager.save(
          manager.create(ComputerEntity, {
            roomId: room.id,
            hostname: m.hostname,
            location: '',
            cpu: m.cpu,
            ramGb: m.ramGb,
            storage: m.storage,
            gpu: m.gpu,
            os: m.os,
            ipAddress: m.localIp,
            macAddress: m.macAddress,
            status: m.status,
            isTeacherMachine: m.role === 'teacher_hub',
            agentMachineId: m.machineId?.trim() || null,
          }),
        );
      }

      const proposal = await manager.findOne(LabRoomProposalEntity, { where: { id } });
      if (!proposal) throw new NotFoundException('Không tìm thấy đề xuất phòng.');
      proposal.status = 'accepted';
      proposal.reviewedBy = reviewerId;
      proposal.reviewedAt = new Date();
      proposal.createdRoomId = room.id;
      if (dto.note !== undefined) proposal.note = dto.note;
      await manager.save(proposal);

      const machines = await manager.find(LabRoomProposalMachineEntity, {
        where: { proposalId: id },
        order: { sortOrder: 'ASC' },
      });

      return {
        roomId: room.id,
        proposal: { ...proposal, machines },
      };
    });
  }
}
