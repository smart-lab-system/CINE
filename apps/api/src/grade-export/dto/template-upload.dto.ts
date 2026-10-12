import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { MAX_TEMPLATE_BYTES } from '../grade-export.types';
import { MSG } from '../grade-export.messages';

/** Xin URL ký để tải file sổ điểm mẫu. `fileSize` chỉ để báo sớm — server tự đo lại bằng HeadObject. */
export class TemplateUploadDto {
  @IsString()
  @Length(1, 255)
  @Matches(/\.xlsx$/i, { message: MSG.wrongExtension })
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_TEMPLATE_BYTES, { message: MSG.tooLarge })
  fileSize!: number;
}
