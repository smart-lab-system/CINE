import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IDE_EXTENSION_JPLAG_QUEUE,
  type JplagExamVsModelJob,
  type JplagExamVsStudentJob,
} from './jplag-exam.constants';
import { JplagExamService } from './jplag-exam.service';

@Processor(IDE_EXTENSION_JPLAG_QUEUE, { concurrency: 1 })
export class JplagExamProcessor extends WorkerHost {
  private readonly logger = new Logger(JplagExamProcessor.name);

  constructor(private readonly jplagExam: JplagExamService) {
    super();
  }

  async process(
    job: Job<JplagExamVsModelJob | JplagExamVsStudentJob>,
  ): Promise<void> {
    if (job.name === 'vs-model') {
      await this.jplagExam.processVsModel(job.data.runId);
      return;
    }
    if (job.name === 'vs-student') {
      await this.jplagExam.processVsStudent(job.data.runId);
      return;
    }
    this.logger.warn(`Unknown jplag job name: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<JplagExamVsModelJob | JplagExamVsStudentJob> | undefined,
    error: Error,
  ): void {
    if (!job) return;
    this.logger.warn(
      `jplag job ${job.name} ${job.data.runId}: attempt ${job.attemptsMade} — ${error.message}`,
    );
  }
}
