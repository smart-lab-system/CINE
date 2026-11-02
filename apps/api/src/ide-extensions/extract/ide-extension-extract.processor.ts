import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IDE_EXTENSION_EXTRACT_CONCURRENCY,
  IDE_EXTENSION_EXTRACT_QUEUE,
} from './ide-extension-extract.constants';
import {
  IdeExtensionExtractFatalError,
  IdeExtensionExtractService,
} from './ide-extension-extract.service';
import type { IdeExtensionExtractJob } from './ide-extension-extract.types';
import { UnsafeExtractPathError } from './ide-extension-extract-path';

@Processor(IDE_EXTENSION_EXTRACT_QUEUE, { concurrency: IDE_EXTENSION_EXTRACT_CONCURRENCY })
export class IdeExtensionExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(IdeExtensionExtractProcessor.name);

  constructor(private readonly extract: IdeExtensionExtractService) {
    super();
  }

  async process(job: Job<IdeExtensionExtractJob>): Promise<void> {
    try {
      await this.extract.processOne(job.data.versionId);
    } catch (error) {
      if (
        error instanceof IdeExtensionExtractFatalError ||
        error instanceof UnsafeExtractPathError
      ) {
        // Status already marked failed in service; stop retries.
        this.logger.warn(
          `version ${job.data.versionId}: fatal extract — ${error.message}`,
        );
        return;
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<IdeExtensionExtractJob> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `version ${job.data.versionId}: lần thử ${job.attemptsMade}/${attempts} thất bại — ${error.message}`,
    );
    if (job.attemptsMade < attempts) return;
    // Keep the real storage/yauzl message (e.g. InvalidKey); only fall back
    // if the job failed without a useful Error.message.
    const detail = error.message?.trim();
    await this.extract.markFailedPermanent(
      job.data.versionId,
      detail
        ? `${detail} (sau ${attempts} lần thử)`.slice(0, 2000)
        : `Giải nén thất bại sau ${attempts} lần thử. Kiểm tra lại file .vsix hoặc bấm thử lại.`,
    );
  }
}
