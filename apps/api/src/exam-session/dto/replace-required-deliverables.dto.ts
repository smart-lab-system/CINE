import {
  ArrayMinSize,
  IsArray,
  Validate,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';
import {
  RequiredFilenameDto,
  UniqueFilenamesConstraint,
} from './create-exam-session.dto';

/**
 * Thay toàn bộ danh sách file bắt buộc của phiên khi còn `scheduled`
 * (spec 2026-10-18-exam-session-create-slim).
 *
 * Shape từng phần tử = `RequiredFilenameDto` (cùng create cũ). `@ArrayMinSize(1)`:
 * create được 0 file; lưu từ hub thì phải ≥ 1.
 */
export class ReplaceRequiredDeliverablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Validate(UniqueFilenamesConstraint)
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          plainToInstance(
            RequiredFilenameDto,
            typeof item === 'string' ? { filename: item } : item,
          ),
        )
      : value,
  )
  @ValidateNested({ each: true })
  requiredFilenames!: RequiredFilenameDto[];
}
