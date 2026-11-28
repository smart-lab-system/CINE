import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  SUBMISSION_EXTRACT_CONCURRENCY,
  SUBMISSION_EXTRACT_QUEUE,
} from './submission-extract.constants';
import {
  SubmissionExtractFatalError,
  SubmissionExtractService,
} from './submission-extract.service';
import type { SubmissionExtractJob } from './submission-extract.types';
import { UnsafeExtractPathError } from '../../ide-extensions/extract/ide-extension-extract-path';

@Processor(SUBMISSION_EXTRACT_QUEUE, { concurrency: SUBMISSION_EXTRACT_CONCURRENCY })
export class SubmissionExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(SubmissionExtractProcessor.name);

  constructor(private readonly extract: SubmissionExtractService) {
    super();
  }

  async process(job: Job<SubmissionExtractJob>): Promise<void> {
    try {
      await this.extract.processOne(job.data.submissionId);
    } catch (error) {
      if (
        error instanceof SubmissionExtractFatalError ||
        error instanceof UnsafeExtractPathError
      ) {
        this.logger.warn(
          `submission ${job.data.submissionId}: fatal extract — ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SubmissionExtractJob> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `submission ${job.data.submissionId}: lần thử ${job.attemptsMade}/${attempts} thất bại — ${error.message}`,
    );
    if (job.attemptsMade < attempts) return;
    const detail = error.message?.trim();
    await this.extract.markFailedPermanent(
      job.data.submissionId,
      detail
        ? `${detail} (sau ${attempts} lần thử)`.slice(0, 2000)
        : `Giải nén thất bại sau ${attempts} lần thử. Hãy thử giải nén lại.`,
    );
  }
}
