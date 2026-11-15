import { JobsOptions } from 'bullmq';

export interface IdeExtensionExtractJob {
  versionId: string;
}

export const IDE_EXTENSION_EXTRACT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: false,
};

export type ExtractTreeNode =
  | { name: string; type: 'file'; size: number }
  | { name: string; type: 'dir'; children: ExtractTreeNode[] };

export interface ExtractTreeDocument {
  root: ExtractTreeNode[];
}
