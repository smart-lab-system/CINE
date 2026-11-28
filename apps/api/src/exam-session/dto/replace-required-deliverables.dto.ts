import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';
import {
  ARCHIVE_EXTENSIONS,
  RequiredFilenameDto,
  UniqueFilenamesConstraint,
} from './create-exam-session.dto';

/**
 * Hub chỉ còn đúng một gói nộp `.zip`|`.rar`
 * (spec 2026-11-28-single-archive-deliverable-design.md).
 */
@ValidatorConstraint({ name: 'SingleArchiveDeliverable', async: false })
export class SingleArchiveDeliverableConstraint implements ValidatorConstraintInterface {
  validate(items: RequiredFilenameDto[] | undefined): boolean {
    if (!Array.isArray(items) || items.length !== 1) {
      return false;
    }
    const name = items[0]?.filename ?? '';
    const lower = name.toLowerCase();
    return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  defaultMessage(): string {
    return `Mỗi phiên chỉ khai đúng một gói nộp ${ARCHIVE_EXTENSIONS.join(' hoặc ')}`;
  }
}

/**
 * Thay toàn bộ danh sách file bắt buộc của phiên khi còn `scheduled`
 * (spec 2026-10-18-exam-session-create-slim + single-archive 2026-11-28).
 *
 * Shape từng phần tử = `RequiredFilenameDto`. Exact 1 + đuôi archive.
 */
export class ReplaceRequiredDeliverablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @Validate(UniqueFilenamesConstraint)
  @Validate(SingleArchiveDeliverableConstraint)
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
