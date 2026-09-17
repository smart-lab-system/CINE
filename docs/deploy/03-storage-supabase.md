# Bước 3 — Đưa object storage từ MinIO sang Supabase Storage

Runbook cho người deploy.

## Kết quả: không sửa dòng code nào

`StorageService` dùng `@aws-sdk/client-s3` với `forcePathStyle: true`, và
Supabase Storage có endpoint tương thích S3. Toàn bộ việc chuyển là thay biến
môi trường.

Đã kiểm ngày 2026-09-17 bằng **đúng 5 thao tác** mà `storage.service.ts` gọi,
không phải một phép thử `ListBuckets` cho có:

| Thao tác | Ở đâu trong code | Kết quả |
| --- | --- | --- |
| `PutObject` | upload tài nguyên đề thi | OK |
| `HeadObject` | `objectExists()` | OK |
| `HeadObject` trên key không tồn tại | `objectExists()` phân biệt "chưa nộp" với "storage hỏng" | OK — trả đúng **404**, không phải mã khác |
| `GetObject` | `getObject()` | OK, nội dung khớp |
| **presigned PUT** | `generateUploadUrl()` — đường agent nộp bài | OK, upload bằng `fetch` trần |
| **presigned GET** | `generateDownloadUrl()` | OK, nội dung khớp |
| **presigned GET + `ResponseContentDisposition`** | tên file khi giảng viên tải bài | OK — trả đúng `attachment; filename="..."` |
| `DeleteObject` | `deleteObject()` | OK |

Hai dòng in đậm là hai thứ từng bị nghi ngờ trước khi đo. Cái thứ hai đặc biệt
đáng lo: key của object là một UUID trần **không có đuôi mở rộng, theo chủ đích**
(xem comment `generateDownloadUrl`), nên nếu Supabase bỏ qua
`ResponseContentDisposition` thì trình duyệt giảng viên sẽ lưu file tên là một
UUID không đuôi. Nó hỗ trợ, nên vấn đề đó không tồn tại.

## Các bước

### 1. Tạo bucket

Bucket phải **private**. Public sẽ vô hiệu hoá toàn bộ mô hình presigned URL:
chữ ký phủ lên đúng một key là thứ ngăn một agent đọc bài của người khác; bucket
public thì ai đoán được key là đọc được.

Tạo bằng dashboard, hoặc bằng SQL trong SQL Editor:

```sql
insert into storage.buckets (id, name, public)
values ('examcollect-submissions', 'examcollect-submissions', false)
on conflict (id) do nothing;
```

### 2. Tạo S3 access key

Dashboard → **Storage → S3 Access Keys** → *New access key*.

Nó cho một cặp **Access key ID** (32 ký tự) + **Secret access key** (64 ký tự).
Secret chỉ hiện **một lần**.

Đây **không phải** `service_role` key và **không phải** publishable key — hai
thứ đó dùng cho REST API của Supabase, không phải giao thức S3.

### 3. Đặt biến môi trường

```dotenv
STORAGE_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3
STORAGE_REGION=<region của project, vd ap-southeast-1>
STORAGE_ACCESS_KEY=<access key id>
STORAGE_SECRET_KEY=<secret>
STORAGE_BUCKET=examcollect-submissions
```

`STORAGE_REGION` phải đúng region của project. MinIO bỏ qua giá trị này nên ở
local đặt gì cũng được; chữ ký SigV4 của S3 thật thì có tính region vào, sai là
`SignatureDoesNotMatch`.

### 4. Kiểm chứng

Khởi động API và nộp thử một bài qua agent. Đếm biến môi trường là không đủ —
đường duy nhất chứng minh được là một lần upload thật đi qua presigned URL.

## Cần để mắt

- **1GB tổng dung lượng** trên free tier. Một lớp 40 sinh viên nộp bài nén là đủ
  để chạm nếu chạy vài phiên thi.
- **50MB mỗi file** là giới hạn mặc định của project. Agent nén cả thư mục bài
  làm thành một file — một project có dataset hoặc thư viện đi kèm sẽ vượt. Nâng
  được trong Dashboard → Storage → Settings, trong giới hạn của gói.
- `.env.test` vẫn trỏ MinIO local, có chủ đích: bộ e2e tạo và xoá object thật và
  không tự dọn (xem `test/setup-env.ts`).
