import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { ClassEntity } from '../course/entities/class.entity';
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
  CreateCatalogExtensionDto,
  CreateCatalogVersionDto,
  CreateCoursePolicyItemDto,
  CreateRoomProposalDto,
  EffectiveQueryDto,
  RejectRoomProposalDto,
  UpdateCatalogExtensionDto,
} from './dto/ide-extensions.dto';
import { deriveCatalogStatus } from './catalog-status';
import { fetchMarketplaceMeta } from './marketplace-client';

@Injectable()
export class IdeExtensionsService {
  constructor(
    private readonly dataSource: DataSource,
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
      versions,
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
