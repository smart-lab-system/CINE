import { IsString, Length } from 'class-validator';

/**
 * Admin đặt lại mật khẩu cho tài khoản - không yêu cầu mật khẩu cũ vì
 * thao tác nằm trong Quản lý tài khoản, không phải tự đổi của người dùng.
 */
export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  password!: string;
}
