import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PLAYGROUND_CONCURRENCY, PLAYGROUND_QUEUE } from './playground.constants';
import { PlaygroundService } from './playground.service';

@Processor(PLAYGROUND_QUEUE, {
  concurrency: PLAYGROUND_CONCURRENCY,
  /** Spring Boot Maven build có thể > 5 phút — tránh BullMQ coi job bị treo. */
  lockDuration: 15 * 60 * 1000,
})
export class PlaygroundProcessor extends WorkerHost {
  private readonly logger = new Logger(PlaygroundProcessor.name);

  constructor(private readonly playground: PlaygroundService) {
    super();
  }

  async process(job: Job<{ runId: string }>): Promise<void> {
    await this.playground.processRun(job.data.runId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ runId: string }> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `playground ${job.data.runId}: lần ${job.attemptsMade}/${attempts} — ${error.message}`,
    );
    if (job.attemptsMade < attempts) return;
    await this.playground.markFailed(
      job.data.runId,
      `chạy thất bại sau nhiều lần thử: ${error.message}`,
    );
  }
}
