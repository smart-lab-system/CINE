import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExamSessionService } from './exam-session.service';
import { CollectionPhaseService } from './collection-phase.service';
import { SessionRosterService } from './session-roster.service';
import { isAwaitingOpen } from './exam-session.types';

/**
 * Closes exam sessions whose `end_time` has passed.
 *
 * Before this existed, `exam_session.status` had no way to leave 'active'
 * on its own: ExamSessionService.create() writes 'active' and nothing ever
 * wrote anything else, so the web UI had to recompute "has this ended?"
 * from the clock on every render. That stays as a display fallback (it
 * updates instantly, without waiting for a tick), but the DB column is the
 * source of truth again.
 */
@Injectable()
export class ExamSessionScheduler {
  // 30s is deliberately coarse. Nothing about finalize is millisecond-
  // sensitive: agents upload for as long as it takes afterwards, and a
  // teacher who needs it closed *now* has the manual endpoint. A tighter
  // interval would only add DB round-trips for a query that returns
  // nothing the overwhelming majority of the time.
  static readonly SWEEP_INTERVAL_MS = 30_000;

  private readonly logger = new Logger(ExamSessionScheduler.name);

  // Guards against overlapping ticks: @Interval fires on a wall clock, not
  // on completion, so a slow sweep (or a slow DB) would otherwise have two
  // runs finalizing the same ids concurrently. Harmless for correctness —
  // finalizeExamSession's WHERE clause already makes double-finalize a
  // no-op — but it would double the query load for no benefit.
  private running = false;

  /**
   * Cờ RIÊNG cho lượt quét thu bài, không dùng chung với `running`:
   * hai lượt làm hai việc khác nhau trên hai tập phiên khác nhau, và
   * để một lượt chậm chặn lượt kia là ghép hai sự cố không liên quan.
   */
  private runningCollectionSweep = false;

  /** Cờ riêng cho lượt thử mở phiên, không chặn finalize hay thu bài. */
  private runningAutoOpen = false;

  constructor(
    private readonly examSessions: ExamSessionService,
    private readonly collectionPhase: CollectionPhaseService,
    private readonly sessionRoster: SessionRosterService,
  ) {}

  @Interval('exam-session-finalize-sweep', ExamSessionScheduler.SWEEP_INTERVAL_MS)
  async handleSweep(): Promise<void> {
    if (this.running) {
      this.logger.debug('finalize sweep skipped: previous tick still running');
      return;
    }
    this.running = true;
    try {
      await this.sweep(new Date());
    } catch (error) {
      // Never let a rejection escape a scheduled handler — an unhandled
      // rejection here would take down the whole API process, and one bad
      // tick must not stop every later tick from running.
      this.logger.error(
        'finalize sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Extracted from the @Interval handler so a test can drive one tick
   * directly at a chosen `now`, with no timers involved.
   *
   * Finalizes sequentially rather than via Promise.all: the list is
   * normally empty and never more than a handful (sessions ending in the
   * same 30s window), and each iteration is a single indexed UPDATE. One
   * session failing must not abort the others, so each is caught
   * individually.
   */
  async sweep(now: Date): Promise<number> {
    const ids = await this.examSessions.findFinalizableIds(now);
    if (ids.length === 0) {
      return 0;
    }

    let finalized = 0;
    for (const id of ids) {
      try {
        if (await this.examSessions.finalizeExamSession(id, 'scheduled')) {
          finalized++;
        }
      } catch (error) {
        this.logger.error(
          `failed to finalize exam session ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (finalized > 0) {
      this.logger.log(`finalize sweep completed ${finalized} exam session(s)`);
    }
    return finalized;
  }

  /**
   * Lượt quét thứ hai: đóng phiên kẹt ở `collecting` vì không ai bấm
   * "Xác nhận kết thúc" — mất điện, đóng nhầm tab, quên. Không có nó
   * thì phiên treo ở `collecting` vĩnh viễn.
   */
  @Interval('exam-session-collection-sweep', ExamSessionScheduler.SWEEP_INTERVAL_MS)
  async handleCollectionSweep(): Promise<void> {
    if (this.runningCollectionSweep) {
      this.logger.debug('collection sweep skipped: previous tick still running');
      return;
    }
    this.runningCollectionSweep = true;
    try {
      await this.sweepExpiredCollection(new Date());
    } catch (error) {
      this.logger.error(
        'collection sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.runningCollectionSweep = false;
    }
  }

  /** Tách khỏi handler để test lái được một tick tại `now` đã chọn. */
  async sweepExpiredCollection(now: Date): Promise<number> {
    const ids = await this.examSessions.findCollectionExpiredIds(now);
    if (ids.length === 0) {
      return 0;
    }

    let closed = 0;
    for (const id of ids) {
      try {
        if (await this.collectionPhase.completeExpired(id)) {
          closed++;
        }
      } catch (error) {
        this.logger.error(
          `failed to close collection for exam session ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (closed > 0) {
      this.logger.log(`collection sweep closed ${closed} exam session(s)`);
    }
    return closed;
  }

  /**
   * Từ 10 phút trước giờ bắt đầu: mở phiên nếu đã đủ điều kiện.
   * Chưa đủ thì `not_ready`. Tới giờ bắt đầu mà vẫn không mở được,
   * hoặc đã qua giờ kết thúc mà chưa mở, thì `missed`.
   */
  @Interval('exam-session-auto-open-sweep', ExamSessionScheduler.SWEEP_INTERVAL_MS)
  async handleAutoOpenSweep(): Promise<void> {
    if (this.runningAutoOpen) {
      this.logger.debug('auto-open sweep skipped: previous tick still running');
      return;
    }
    this.runningAutoOpen = true;
    try {
      await this.sweepAutoOpen(new Date());
    } catch (error) {
      this.logger.error(
        'auto-open sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.runningAutoOpen = false;
    }
  }

  async sweepAutoOpen(now: Date): Promise<number> {
    const ids = await this.examSessions.findAwaitingOpenIds(now);
    if (ids.length === 0) {
      return 0;
    }

    let changed = 0;
    for (const id of ids) {
      try {
        const outcome = await this.advanceAutoOpen(id, now);
        if (outcome !== 'unchanged') {
          changed++;
        }
      } catch (error) {
        this.logger.error(
          `failed to auto-open exam session ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (changed > 0) {
      this.logger.log(`auto-open sweep updated ${changed} exam session(s)`);
    }
    return changed;
  }

  private async advanceAutoOpen(
    id: string,
    now: Date,
  ): Promise<'opened' | 'not_ready' | 'missed' | 'unchanged'> {
    const session = await this.examSessions.findById(id);
    if (!session || !isAwaitingOpen(session.status)) {
      return 'unchanged';
    }

    if (now.getTime() >= session.endTime.getTime()) {
      const marked = await this.examSessions.transitionUnopened(id, 'missed');
      return marked ? 'missed' : 'unchanged';
    }

    try {
      await this.sessionRoster.freeze(session);
      return 'opened';
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        return 'unchanged';
      }
      if (!(error instanceof BadRequestException)) {
        throw error;
      }
      const next = now.getTime() >= session.startTime.getTime() ? 'missed' : 'not_ready';
      if (session.status === next) {
        return 'unchanged';
      }
      const marked = await this.examSessions.transitionUnopened(id, next);
      return marked ? next : 'unchanged';
    }
  }
}
