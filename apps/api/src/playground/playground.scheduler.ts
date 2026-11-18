import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PLAYGROUND_EXPIRE_SWEEP_MS } from './playground.constants';
import { PlaygroundService } from './playground.service';

/**
 * Lưới an toàn thưa: delayed BullMQ expire tắt đúng giờ;
 * sweep bắt sót (mất job Redis, race stop/start).
 */
@Injectable()
export class PlaygroundScheduler {
  private readonly logger = new Logger(PlaygroundScheduler.name);
  private running = false;

  constructor(private readonly playground: PlaygroundService) {}

  @Interval('playground-expire-sweep', PLAYGROUND_EXPIRE_SWEEP_MS)
  async handleSweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.playground.expireExpiredPreviews();
      if (n > 0) this.logger.log(`sweep hết hạn ${n} playground preview (lưới an toàn)`);
    } catch (error) {
      this.logger.warn(
        `playground expire sweep lỗi: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
