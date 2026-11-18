import { Injectable } from '@nestjs/common';
import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';
import { GradingInputTooLargeError } from '../extract-text';
import { MAX_GRADING_INPUT_BYTES } from '../grading.types';
import { resolveCodeProjectText } from './code-project-text';
import { ResolvedContent, SubmissionContentResolver } from './submission-content-resolver';

/**
 * Bài code đường one_shot (đọc mã): `.java` / text lẻ và ZIP chứa mã nguồn.
 *
 * Investigator (cpp/python chạy sandbox) vẫn dùng `sourceFilesOf` riêng —
 * resolver này chỉ cung cấp `text` cho AI + panel hồ sơ.
 */
@Injectable()
export class CodeProjectResolver implements SubmissionContentResolver {
  readonly handles: DeliverableType = 'code_project';

  async resolve(bytes: Buffer, declaredFilename: string): Promise<ResolvedContent> {
    if (bytes.byteLength > MAX_GRADING_INPUT_BYTES) {
      throw new GradingInputTooLargeError(bytes.byteLength);
    }
    return { text: await resolveCodeProjectText(bytes, declaredFilename) };
  }
}
