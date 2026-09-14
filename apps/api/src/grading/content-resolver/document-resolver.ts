import { Injectable } from '@nestjs/common';
import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';
import { extractText, GradingInputTooLargeError } from '../extract-text';
import { MAX_GRADING_INPUT_BYTES } from '../grading.types';
import { ResolvedContent, SubmissionContentResolver } from './submission-content-resolver';

/**
 * Bài tự luận: `.docx` qua mammoth, và các định dạng text thuần.
 *
 * Định dạng không đọc được (`.pdf`, `.doc`, ảnh, archive) trả chuỗi RỖNG
 * chứ không ném — xem `extractText` để biết vì sao đoán nội dung còn tệ hơn
 * là thừa nhận không đọc được.
 */
@Injectable()
export class DocumentResolver implements SubmissionContentResolver {
  readonly handles: DeliverableType = 'document';

  async resolve(bytes: Buffer, declaredFilename: string): Promise<ResolvedContent> {
    // Trần kích thước áp Ở ĐÂY, không ở `extractText`.
    //
    // Đó chính là điều comment cũ trong `extractText` TUYÊN BỐ — "để mọi
    // provider, kể cả provider thêm sau này, đều đi qua cùng một cửa" —
    // nhưng không thực hiện được: ảnh không đi qua `extractText` (nó trả
    // rỗng cho ảnh), nên cái cửa ấy thủng đúng bằng nhánh chưa xây. Ở tầng
    // resolver thì MỌI nhánh đều phải qua, và nhánh thêm sau cũng vậy.
    if (bytes.byteLength > MAX_GRADING_INPUT_BYTES) {
      throw new GradingInputTooLargeError(bytes.byteLength);
    }

    return { text: await extractText(bytes, declaredFilename) };
  }
}
