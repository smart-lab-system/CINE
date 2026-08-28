import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { setStatusChangeContext } from '../../common/db-session-context';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LabLayoutEntity } from '../../labs/entities/lab-layout.entity';
import { LabSeatEntity } from '../../labs/entities/lab-seat.entity';
import { CourseSectionEnrollmentEntity } from '../../master-data/entities/course-section-enrollment.entity';
import { LecturerEntity } from '../../master-data/entities/lecturer.entity';
import { ExamEventEntity } from '../entities/exam-event.entity';
import { ExamEventSectionEntity } from '../entities/exam-event-section.entity';
import { LabSessionEntity } from '../entities/lab-session.entity';
import { SessionProctorEntity } from '../entities/session-proctor.entity';
import { SessionParticipantEntity } from '../entities/session-participant.entity';
import { SessionStatusHistoryEntity } from '../entities/session-status-history.entity';
import { AddParticipantDto } from './dto/add-participant.dto';
import { AssignProctorDto } from './dto/assign-proctor.dto';
import { BulkAddParticipantsDto } from './dto/bulk-add-participants.dto';
import { CreateLabSessionDto } from './dto/create-lab-session.dto';
import { UpdateLabSessionDto } from './dto/update-lab-session.dto';
import { TransitionLabSessionStatusDto } from './dto/transition-status.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import {
  LabSessionDetailDto,
  LabSessionViewDto,
  SessionParticipantViewDto,
  SessionProctorViewDto,
  SessionStatusHistoryViewDto,
} from './dto/lab-session-response.dto';

@Injectable()
export class LabSessionsService {
  constructor(
    @InjectRepository(LabSessionEntity)
    private readonly sessions: Repository<LabSessionEntity>,
    @InjectRepository(ExamEventEntity)
    private readonly events: Repository<ExamEventEntity>,
    @InjectRepository(LabLayoutEntity)
    private readonly layouts: Repository<LabLayoutEntity>,
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
    @InjectRepository(SessionProctorEntity)
    private readonly proctors: Repository<SessionProctorEntity>,
    @InjectRepository(SessionParticipantEntity)
    private readonly participants: Repository<SessionParticipantEntity>,
    @InjectRepository(ExamEventSectionEntity)
    private readonly eventSections: Repository<ExamEventSectionEntity>,
    @InjectRepository(CourseSectionEnrollmentEntity)
    private readonly enrollments: Repository<CourseSectionEnrollmentEntity>,
    @InjectRepository(LabSeatEntity)
    private readonly seats: Repository<LabSeatEntity>,
    @InjectRepository(SessionStatusHistoryEntity)
    private readonly statusHistory: Repository<SessionStatusHistoryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    eventId: string,
    dto: CreateLabSessionDto,
    userId: string,
  ): Promise<{ id: string }> {
    await this.findActiveEventOrThrow(eventId);
    await this.assertLayoutBelongsToLab(dto.labId, dto.layoutId);

    const saved = await this.sessions.save(
      this.sessions.create({
        examEventId: eventId,
        code: dto.code,
        title: dto.title,
        labId: dto.labId,
        layoutId: dto.layoutId,
        scheduledStartAt: dto.scheduledStartAt
          ? new Date(dto.scheduledStartAt)
          : null,
        scheduledEndAt: dto.scheduledEndAt
          ? new Date(dto.scheduledEndAt)
          : null,
        status: 'draft',
        createdBy: userId,
      }),
    );
    return { id: saved.id };
  }

  async search(
    eventId: string,
    query: PaginationQueryDto,
  ): Promise<{ items: LabSessionViewDto[]; total: number }> {
    await this.findActiveEventOrThrow(eventId);
    const qb = this.sessions
      .createQueryBuilder('s')
      .where('s.exam_event_id = :eventId', { eventId })
      .andWhere('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(s.code ILIKE :term OR s.title ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('s.scheduled_start_at', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async findOne(
    eventId: string,
    sessionId: string,
  ): Promise<LabSessionDetailDto> {
    const session = await this.findActiveSessionOrThrow(eventId, sessionId);
    const [proctors, participantCount] = await Promise.all([
      this.proctors.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
      }),
      this.participants.count({ where: { sessionId } }),
    ]);
    return {
      ...this.toView(session),
      proctors: proctors.map((p) => this.toProctorView(p)),
      participantCount,
    };
  }

  async update(
    eventId: string,
    sessionId: string,
    dto: UpdateLabSessionDto,
  ): Promise<LabSessionViewDto> {
    const session = await this.findActiveSessionOrThrow(eventId, sessionId);
    const labId = dto.labId ?? session.labId;
    const layoutId = dto.layoutId ?? session.layoutId;
    if (dto.labId !== undefined || dto.layoutId !== undefined) {
      await this.assertLayoutBelongsToLab(labId, layoutId);
    }

    const result = await this.sessions
      .createQueryBuilder()
      .update(LabSessionEntity)
      .set({
        code: dto.code ?? session.code,
        title: dto.title ?? session.title,
        labId,
        layoutId,
        scheduledStartAt: dto.scheduledStartAt
          ? new Date(dto.scheduledStartAt)
          : session.scheduledStartAt,
        scheduledEndAt: dto.scheduledEndAt
          ? new Date(dto.scheduledEndAt)
          : session.scheduledEndAt,
      })
      .where('id = :id', { id: sessionId })
      .andWhere('exam_event_id = :eventId', { eventId })
      .andWhere('row_version = :v', { v: dto.rowVersion })
      .andWhere('deleted_at IS NULL')
      .execute();

    if (!result.affected) {
      throw new ConflictException(
        'The sitting was updated by another request.',
      );
    }

    return this.toView(
      await this.findActiveSessionOrThrow(eventId, sessionId),
    );
  }

  async remove(eventId: string, sessionId: string): Promise<void> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    await this.sessions.update(sessionId, { deletedAt: new Date() });
  }

  async transitionStatus(
    eventId: string,
    sessionId: string,
    dto: TransitionLabSessionStatusDto,
    userId: string,
  ): Promise<LabSessionDetailDto> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    const commandId = randomUUID();

    await this.dataSource.transaction(async (manager) => {
      await setStatusChangeContext(manager, {
        userId,
        commandId,
        reason: dto.reason.trim(),
      });

      const result = await manager
        .createQueryBuilder()
        .update(LabSessionEntity)
        .set({ status: dto.toStatus })
        .where('id = :id', { id: sessionId })
        .andWhere('exam_event_id = :eventId', { eventId })
        .andWhere('row_version = :v', { v: dto.rowVersion })
        .andWhere('deleted_at IS NULL')
        .execute();

      if (!result.affected) {
        throw new ConflictException(
          'The sitting was updated by another request.',
        );
      }
    });

    return this.findOne(eventId, sessionId);
  }

  async listStatusHistory(
    eventId: string,
    sessionId: string,
  ): Promise<{ items: SessionStatusHistoryViewDto[]; total: number }> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    const rows = await this.statusHistory.find({
      where: { sessionId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const items = rows.map((row) => this.toHistoryView(row));
    return { items, total: items.length };
  }

  async addProctor(
    eventId: string,
    sessionId: string,
    dto: AssignProctorDto,
    userId: string,
  ): Promise<{ id: string }> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    await this.assertActiveLecturer(dto.lecturerId);
    if (dto.role === 'lead') {
      await this.assertNoExistingLead(sessionId);
    }

    const saved = await this.proctors.save(
      this.proctors.create({
        sessionId,
        lecturerId: dto.lecturerId,
        role: dto.role,
        assignedBy: userId,
      }),
    );
    return { id: saved.id };
  }

  async removeProctor(
    eventId: string,
    sessionId: string,
    proctorId: string,
  ): Promise<void> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    const proctor = await this.proctors.findOne({ where: { id: proctorId } });
    if (!proctor || proctor.sessionId !== sessionId) {
      throw new NotFoundException('Proctor assignment not found');
    }
    await this.proctors.delete(proctorId);
  }

  async listParticipants(
    eventId: string,
    sessionId: string,
  ): Promise<{ items: SessionParticipantViewDto[]; total: number }> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    const rows = await this.participants.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return {
      items: rows.map((p) => this.toParticipantView(p)),
      total: rows.length,
    };
  }

  async addParticipant(
    eventId: string,
    sessionId: string,
    dto: AddParticipantDto,
  ): Promise<{ id: string }> {
    const session = await this.findActiveSessionOrThrow(eventId, sessionId);
    await this.assertAttachedSection(eventId, dto.courseSectionId);
    await this.assertActiveEnrollment(dto.courseSectionId, dto.studentId);
    if (dto.seatId) {
      await this.assertSeatOnLayout(session.layoutId, dto.seatId);
      await this.assertSeatFree(sessionId, dto.seatId);
    }
    await this.assertStudentNotOnSession(sessionId, dto.studentId);

    const saved = await this.participants.save(
      this.participants.create({
        sessionId,
        layoutId: session.layoutId,
        courseSectionId: dto.courseSectionId,
        studentId: dto.studentId,
        seatId: dto.seatId ?? null,
        status: 'registered',
      }),
    );
    return { id: saved.id };
  }

  async bulkAddParticipants(
    eventId: string,
    sessionId: string,
    dto: BulkAddParticipantsDto,
  ): Promise<{ ids: string[] }> {
    const session = await this.findActiveSessionOrThrow(eventId, sessionId);
    await this.assertAttachedSection(eventId, dto.courseSectionId);
    const studentIds = [...new Set(dto.studentIds)];
    await this.assertActiveEnrollments(dto.courseSectionId, studentIds);
    for (const studentId of studentIds) {
      await this.assertStudentNotOnSession(sessionId, studentId);
    }

    const saved = await this.participants.save(
      studentIds.map((studentId) =>
        this.participants.create({
          sessionId,
          layoutId: session.layoutId,
          courseSectionId: dto.courseSectionId,
          studentId,
          seatId: null,
          status: 'registered',
        }),
      ),
    );
    return { ids: saved.map((row) => row.id) };
  }

  async updateParticipant(
    eventId: string,
    sessionId: string,
    participantId: string,
    dto: UpdateParticipantDto,
  ): Promise<SessionParticipantViewDto> {
    const session = await this.findActiveSessionOrThrow(eventId, sessionId);
    const participant = await this.findParticipantOrThrow(
      sessionId,
      participantId,
    );
    const nextSeatId =
      dto.seatId !== undefined ? dto.seatId : participant.seatId;
    if (nextSeatId) {
      await this.assertSeatOnLayout(session.layoutId, nextSeatId);
      await this.assertSeatFree(sessionId, nextSeatId, participantId);
    }

    participant.seatId = nextSeatId;
    if (dto.notes !== undefined) {
      participant.notes = dto.notes;
    }
    const saved = await this.participants.save(participant);
    return this.toParticipantView(saved);
  }

  async removeParticipant(
    eventId: string,
    sessionId: string,
    participantId: string,
  ): Promise<void> {
    await this.findActiveSessionOrThrow(eventId, sessionId);
    await this.findParticipantOrThrow(sessionId, participantId);
    await this.participants.delete(participantId);
  }

  private async findActiveEventOrThrow(
    eventId: string,
  ): Promise<ExamEventEntity> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event || event.deletedAt) {
      throw new NotFoundException('Exam event not found');
    }
    return event;
  }

  private async findActiveSessionOrThrow(
    eventId: string,
    sessionId: string,
  ): Promise<LabSessionEntity> {
    await this.findActiveEventOrThrow(eventId);
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session || session.deletedAt || session.examEventId !== eventId) {
      throw new NotFoundException('Lab session not found');
    }
    return session;
  }

  private async assertLayoutBelongsToLab(
    labId: string,
    layoutId: string,
  ): Promise<void> {
    const layout = await this.layouts.findOne({ where: { id: layoutId } });
    if (!layout || layout.deletedAt) {
      throw new BadRequestException('Layout not found');
    }
    if (layout.labId !== labId) {
      throw new BadRequestException(
        'Layout does not belong to the given lab',
      );
    }
  }

  private async assertActiveLecturer(lecturerId: string): Promise<void> {
    const lecturer = await this.lecturers.findOne({
      where: { id: lecturerId },
    });
    if (!lecturer || lecturer.deletedAt) {
      throw new NotFoundException('Lecturer not found');
    }
  }

  private async assertNoExistingLead(sessionId: string): Promise<void> {
    const existingLead = await this.proctors.findOne({
      where: { sessionId, role: 'lead' },
    });
    if (existingLead) {
      throw new ConflictException('This sitting already has a lead proctor.');
    }
  }

  private async findParticipantOrThrow(
    sessionId: string,
    participantId: string,
  ): Promise<SessionParticipantEntity> {
    const participant = await this.participants.findOne({
      where: { id: participantId },
    });
    if (!participant || participant.sessionId !== sessionId) {
      throw new NotFoundException('Participant not found');
    }
    return participant;
  }

  private async assertAttachedSection(
    eventId: string,
    courseSectionId: string,
  ): Promise<void> {
    const link = await this.eventSections.findOne({
      where: {
        examEventId: eventId,
        courseSectionId,
        deletedAt: IsNull(),
      },
    });
    if (!link) {
      throw new BadRequestException(
        'Course section is not attached to this exam event',
      );
    }
  }

  private async assertActiveEnrollment(
    courseSectionId: string,
    studentId: string,
  ): Promise<void> {
    await this.assertActiveEnrollments(courseSectionId, [studentId]);
  }

  private async assertActiveEnrollments(
    courseSectionId: string,
    studentIds: string[],
  ): Promise<void> {
    const rows = await this.enrollments.find({
      where: {
        courseSectionId,
        studentId: In(studentIds),
        status: 'active',
        deletedAt: IsNull(),
      },
    });
    if (rows.length !== studentIds.length) {
      throw new BadRequestException(
        'Student is not actively enrolled in this course section',
      );
    }
  }

  private async assertSeatOnLayout(
    layoutId: string,
    seatId: string,
  ): Promise<void> {
    const seat = await this.seats.findOne({ where: { id: seatId } });
    if (!seat || seat.deletedAt || seat.layoutId !== layoutId) {
      throw new BadRequestException(
        'Seat does not belong to this sitting layout',
      );
    }
  }

  private async assertStudentNotOnSession(
    sessionId: string,
    studentId: string,
  ): Promise<void> {
    const existing = await this.participants.findOne({
      where: { sessionId, studentId },
    });
    if (existing) {
      throw new ConflictException(
        'This student is already on the sitting roster.',
      );
    }
  }

  private async assertSeatFree(
    sessionId: string,
    seatId: string,
    exceptParticipantId?: string,
  ): Promise<void> {
    const taken = await this.participants.findOne({
      where: { sessionId, seatId },
    });
    if (taken && taken.id !== exceptParticipantId) {
      throw new ConflictException(
        'This seat is already assigned on the sitting.',
      );
    }
  }

  private toView(session: LabSessionEntity): LabSessionViewDto {
    return {
      id: session.id,
      examEventId: session.examEventId,
      code: session.code,
      title: session.title,
      labId: session.labId,
      layoutId: session.layoutId,
      scheduledStartAt: (session.scheduledStartAt as Date).toISOString(),
      scheduledEndAt: (session.scheduledEndAt as Date).toISOString(),
      status: session.status,
      rowVersion: Number(session.rowVersion),
      createdBy: session.createdBy,
    };
  }

  private toProctorView(proctor: SessionProctorEntity): SessionProctorViewDto {
    return {
      id: proctor.id,
      lecturerId: proctor.lecturerId,
      role: proctor.role,
      assignedBy: proctor.assignedBy,
    };
  }

  private toParticipantView(
    participant: SessionParticipantEntity,
  ): SessionParticipantViewDto {
    return {
      id: participant.id,
      sessionId: participant.sessionId,
      studentId: participant.studentId,
      courseSectionId: participant.courseSectionId,
      layoutId: participant.layoutId,
      seatId: participant.seatId,
      status: participant.status,
      notes: participant.notes,
    };
  }

  private toHistoryView(
    row: SessionStatusHistoryEntity,
  ): SessionStatusHistoryViewDto {
    return {
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      actorType: row.actorType,
      changedBy: row.changedBy,
      commandId: row.commandId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
