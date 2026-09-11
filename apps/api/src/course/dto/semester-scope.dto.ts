import { IsOptional, IsUUID } from 'class-validator';

/**
 * Bộ lọc kỳ cho các route danh sách.
 *
 * `@IsOptional` là phần quan trọng: vắng `semesterId` nghĩa là "tất cả
 * học kỳ", không phải lỗi. Học kỳ ở đây là tham số lọc, không phải điều
 * kiện để thao tác được — CLAUDE.md §1.2: hệ thống không bao giờ từ chối
 * một thao tác vì lý do liên quan tới học kỳ.
 */
export class SemesterScopeDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
