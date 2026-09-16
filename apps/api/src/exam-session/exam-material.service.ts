import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamMaterialEntity } from './entities/exam-material.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { isExamOver } from './exam-session.types';
import { StorageService } from '../storage/storage.service';
import { CreateExamMaterialDto, RequestMaterialUploadDto } from './dto/exam-material.dto';
import { ExamSessionEvents } from './exam-session.events';

/** What a teacher sees about a material they uploaded. */
export interface ExamMaterialView {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  /** Present only where the caller is allowed to fetch the bytes. */
  downloadUrl?: string;
}

/**
 * Exam materials — the question paper, the dataset, the starter code.
 *
 * Files never pass through this server (Security rule 5): a teacher PUTs to
 * a presigned URL and then tells us it landed, and an agent GETs from
 * another. This class only ever mints URLs, checks whether an object
 * exists, and decides who may be given one.
 *
 * That last part is Security rule 2 and it is the reason this file exists
 * as its own service rather than three more handlers on a controller: an
 * agent may only receive materials once `start_time` has passed, even if it
 * connected earlier. The gate is on the READ path — one method, one place —
 * because "allowed into the lobby" and "allowed to see the exam" are
 * different questions and the second one must not be answered by accident.
 */
@Injectable()
export class ExamMaterialService {
  constructor(
    @InjectRepository(ExamMaterialEntity)
    private readonly materials: Repository<ExamMaterialEntity>,
    private readonly storage: StorageService,
    private readonly events: ExamSessionEvents,
  ) {}

  /**
   * Step one: an id and a place to put the bytes. No row yet.
   *
   * The row is written only once the object is really there (see `create`),
   * so a failed upload leaves nothing behind claiming an exam paper exists.
   * The id is minted here rather than accepted from the client because it
   * becomes part of the storage key.
   */
  async requestUpload(
    session: ExamSessionEntity,
    dto: RequestMaterialUploadDto,
  ): Promise<{ examMaterialId: string; storageKey: string; uploadUrl: string; expiresIn: number }> {
    const examMaterialId = randomUUID();
    const storageKey = this.storage.buildMaterialKey(session.id, examMaterialId);
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
    // dto.fileName is not used to build anything — it is recorded in step
    // two, for display only.
    void dto;
    return { examMaterialId, storageKey, uploadUrl, expiresIn };
  }

  /**
   * Step two: the upload landed, so record it.
   *
   * Both checks matter. The key is rebuilt from the id rather than trusted
   * from the body, so a client cannot register a row pointing at an object
   * it does not own; and storage is asked whether the object is actually
   * there, so a teacher cannot end up with a session that lists an exam
   * paper nobody can open.
   */
  async create(
    session: ExamSessionEntity,
    dto: CreateExamMaterialDto,
  ): Promise<ExamMaterialView> {
    const storageKey = this.storage.buildMaterialKey(session.id, dto.examMaterialId);
    if (dto.storageKey !== storageKey) {
      throw new BadRequestException('Storage key does not match this material.');
    }
    if (!(await this.storage.objectExists(storageKey))) {
      throw new BadRequestException(
        'Chưa thấy file trên kho lưu trữ — hãy tải lên trước rồi xác nhận.',
      );
    }

    const saved = await this.materials.save(
      this.materials.create({
        id: dto.examMaterialId,
        examSessionId: session.id,
        storageKey,
        fileName: dto.fileName,
        fileSize: String(dto.fileSize),
      }),
    );
    // QA-reported gap: an agent that joined before this material existed
    // used to never learn it was added — it asked for materials exactly
    // once, at join-ack time. This nudges every already-connected agent in
    // the session to ask again; ExamSessionGateway owns the actual
    // broadcast (see its own doc comment for why this goes through an
    // event bus rather than injecting the gateway here).
    this.events.publishMaterialAdded({ examSessionId: session.id });
    return this.toView(saved);
  }

  /** Everything attached to this session, for its owner, with fetch URLs. */
  async listForTeacher(session: ExamSessionEntity): Promise<ExamMaterialView[]> {
    const rows = await this.materials.find({
      where: { examSessionId: session.id },
      order: { uploadedAt: 'ASC' },
    });
    return Promise.all(rows.map((row) => this.toView(row, true)));
  }

  /**
   * The same list for an AGENT — and the one place Security rule 2 is
   * enforced.
   *
   * Before `start_time` this returns nothing, whatever else is true about
   * the connection. An agent is allowed to be in the lobby early; it is not
   * allowed to hold the exam paper early. Handing the files over on join
   * would leak the exam to whoever connected first, which is precisely the
   * failure the rule names.
   *
   * `now` is a parameter so the gate can be tested at both sides of the
   * boundary. The socket path cannot currently reach the closed side —
   * `agent:join` independently refuses a session that has not started — but
   * that is a second lock on the same door, not a reason to leave this one
   * open.
   */
  async listForAgent(
    session: ExamSessionEntity,
    now: Date,
  ): Promise<
    | { released: true; materials: ExamMaterialView[] }
    | { released: false; releaseAt: string }
  > {
    if (now.getTime() < session.startTime.getTime()) {
      return { released: false, releaseAt: session.startTime.toISOString() };
    }

    const rows = await this.materials.find({
      where: { examSessionId: session.id },
      order: { uploadedAt: 'ASC' },
    });
    return {
      released: true,
      materials: await Promise.all(rows.map((row) => this.toView(row, true))),
    };
  }

  /**
   * Removes a material and its object together.
   *
   * Dropping only the row would leave the file in storage forever, still
   * readable by anyone who kept an old signed URL — an exam paper that the
   * teacher believes they deleted.
   */
  async remove(session: ExamSessionEntity, examMaterialId: string): Promise<void> {
    const material = await this.materials.findOne({
      where: { id: examMaterialId, examSessionId: session.id },
    });
    if (!material) {
      // Scoped to the session on purpose: a valid id from ANOTHER session
      // must read as "not found", not as someone else's file.
      throw new NotFoundException('Exam material not found');
    }
    // `isExamOver`: đề thi phải khoá ngay khi hết giờ, không đợi tới lúc
    // giảng viên chốt — nếu không, nó mở khoá xoá trở lại suốt cửa sổ
    // thu bài.
    if (isExamOver(session.status)) {
      throw new ForbiddenException(
        'Phiên thi đã kết thúc — đề thi được giữ lại để đối chiếu, không xoá được nữa.',
      );
    }

    await this.materials.remove(material);
    await this.storage.deleteObject(material.storageKey);
  }

  private async toView(
    material: ExamMaterialEntity,
    withUrl = false,
  ): Promise<ExamMaterialView> {
    const view: ExamMaterialView = {
      id: material.id,
      fileName: material.fileName,
      // bigint comes back as a string from the driver; the API speaks
      // numbers, and an exam paper is never near Number.MAX_SAFE_INTEGER.
      fileSize: Number(material.fileSize),
      uploadedAt: material.uploadedAt.toISOString(),
    };
    if (withUrl) {
      // QA-reported gap (same root cause as submission downloads): the
      // storage key is a bare id, no extension for a browser to go on.
      view.downloadUrl = (
        await this.storage.generateDownloadUrl(material.storageKey, {
          filename: material.fileName,
        })
      ).downloadUrl;
    }
    return view;
  }
}
