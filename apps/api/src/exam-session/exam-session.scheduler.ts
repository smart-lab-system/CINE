import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExamSessionService } from './exam-session.service';

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

  constructor(private readonly examSessions: ExamSessionService) {}

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
}
