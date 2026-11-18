import type { JobsOptions } from 'bullmq';

export const IDE_EXTENSION_JPLAG_QUEUE = 'ide-extension-jplag';

export const IDE_EXTENSION_JPLAG_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export type JplagExamJobName = 'vs-model' | 'vs-student';

export type JplagExamVsModelJob = {
  runId: string;
};

export type JplagExamVsStudentJob = {
  runId: string;
};
