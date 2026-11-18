import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PlaygroundService } from './playground.service';

/** Dọn preview quá TTL dù không ai còn mở trang / poll GET. */
@Injectable()
export class PlaygroundScheduler {
  static readonly SWEEP_INTERVAL_MS = 30_000;

  private readonly logger = new Logger(PlaygroundScheduler.name);
  private running = false;

  constructor(private readonly playground: PlaygroundService) {}

  @Interval('playground-expire-sweep', PlaygroundScheduler.SWEEP_INTERVAL_MS)
  async handleSweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.playground.expireExpiredPreviews();
      if (n > 0) this.logger.log(`hết hạn ${n} playground preview`);
    } catch (error) {
      this.logger.warn(
        `playground expire sweep lỗi: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
