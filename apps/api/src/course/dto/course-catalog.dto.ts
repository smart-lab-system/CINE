import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * Bộ lọc cho danh mục môn cấp trường.
 *
 * `unowned` là chuỗi `'true'`, KHÔNG phải boolean, và đó là quyết định tường
 * minh: `ValidationPipe` của app là `{ whitelist: true, transform: true }` và
 * KHÔNG bật `enableImplicitConversion`, nên một query param khai là `boolean`
 * sẽ tới service dưới dạng chuỗi. Bẫy im lặng ở đó là `"false"` cũng truthy —
 * `?unowned=false` sẽ lọc ngược ý người gọi mà không báo gì.
 *
 * `@IsIn(['true'])` đóng bẫy: chỉ một giá trị hợp lệ, mọi thứ khác ra 400.
 * Không có vế `owned` vì trang chỉ có một công tắc "Chỉ môn chưa có chủ":
 * tắt = tất cả, bật = chưa có chủ.
 */
export class CourseCatalogQueryDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsIn(['true'])
  unowned?: 'true';
}
