import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

/**
 * Names an uploaded file for display only.
 *
 * It never becomes part of a storage key — the key is built from the
 * material's own id — so this is validated for length and for being
 * printable rather than for path safety. It is still bounded and stripped
 * of separators, because a filename with a "/" in it renders as a lie about
 * where the file is.
 */
const DISPLAY_FILENAME_REGEX = /^[^/\<>:"|?*\u0000-\u001f]+$/;

/** 100 MB. A question paper or a dataset, not a disk image. */
const MAX_MATERIAL_BYTES = 100 * 1024 * 1024;

export class RequestMaterialUploadDto {
  @IsString()
  @Length(1, 255)
  @Matches(DISPLAY_FILENAME_REGEX, {
    message: 'Tên file không được chứa ký tự phân cách đường dẫn',
  })
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_MATERIAL_BYTES)
  fileSize!: number;
}

/**
 * Confirms the upload landed. `storageKey` is echoed back and re-derived
 * server-side before it is trusted: registering a row that points at an
 * object the caller does not own would make one session's material readable
 * through another's list.
 */
export class CreateExamMaterialDto extends RequestMaterialUploadDto {
  @IsUUID()
  examMaterialId!: string;

  @IsString()
  @Length(1, 512)
  storageKey!: string;
}
