# Công nghệ sử dụng trong dự án CINE (ExamCollect)

Tài liệu liệt kê các công nghệ chính của hệ thống **ExamCollect** — thu bài thi tự động và hỗ trợ giáo viên chấm điểm bằng AI.

Mỗi công nghệ gồm hai phần:
- **Giới thiệu:** lý thuyết về công nghệ (khoảng 4–5 câu).
- **Lý do dùng trong dự án:** vì sao công nghệ đó *phù hợp* với bài toán và ràng buộc của ExamCollect (không chỉ mô tả chỗ đang gắn trong code).

Nguồn tham chiếu: `package.json`, `docker-compose.yml`, `README.md`.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Nền tảng & công cụ monorepo](#2-nền-tảng--công-cụ-monorepo)
3. [Backend (API)](#3-backend-api)
4. [Cơ sở dữ liệu & lưu trữ](#4-cơ-sở-dữ-liệu--lưu-trữ)
5. [Xác thực & bảo mật](#5-xác-thực--bảo-mật)
6. [Frontend (Web)](#6-frontend-web)
7. [Student Agent](#7-student-agent)
8. [Thời gian thực & hàng đợi](#8-thời-gian-thực--hàng-đợi)
9. [AI & chấm điểm](#9-ai--chấm-điểm)
10. [Hợp đồng API & chia sẻ kiểu](#10-hợp-đồng-api--chia-sẻ-kiểu)
11. [Hạ tầng & triển khai](#11-hạ-tầng--triển-khai)
12. [Kiểm thử](#12-kiểm-thử)

---

## 1. Tổng quan kiến trúc

Hệ thống gồm ba phần chính:

| Thành phần | Công nghệ chính | Vai trò |
| --- | --- | --- |
| Web portal | Next.js 15 + React 19 | UI cho admin / giáo viên (lobby thi, thu bài, chấm) |
| API | NestJS 10 | Business logic, auth, grading pipeline, WebSocket gateway |
| Student Agent | Electron | App trên máy phòng máy: kết nối phiên thi, tạo/thu file nộp |

Monorepo `pnpm` + Turborepo gom `apps/api`, `apps/web`, `apps/agent`, `packages/shared` để dùng chung TypeScript và client OpenAPI.

---

## 2. Nền tảng & công cụ monorepo

### 2.1. TypeScript

**Giới thiệu.** TypeScript là ngôn ngữ lập trình được Microsoft phát triển như một siêu tập của JavaScript. Nó bổ sung hệ thống kiểu tĩnh, cho phép khai báo kiểu cho biến, hàm, đối tượng và module ngay từ lúc viết mã. Trình biên dịch TypeScript kiểm tra tính nhất quán của kiểu trước khi sinh ra JavaScript thuần, nhờ đó nhiều lớp lỗi (sai tên thuộc tính, nhầm kiểu tham số, null không kiểm soát) bị phát hiện sớm. TypeScript còn hỗ trợ interface, generic, enum và các cấu trúc giúp mô hình hóa domain phức tạp rõ ràng hơn. Trong hệ sinh thái web hiện đại, TypeScript gần như là chuẩn mặc định cho dự án quy mô vừa và lớn vì cải thiện khả năng bảo trì và hỗ trợ IDE.

**Lý do dùng trong dự án.** ExamCollect có domain dày quan hệ (phiên thi, enrollment, rubric, kết quả chấm AI) và API–UI phải cùng “nói” một contract. Kiểu tĩnh giúp mô hình hóa các thực thể đó một cách an toàn và giảm lệch schema giữa NestJS và Next.js khi hệ thống mở rộng theo từng module đồ án.

### 2.2. Node.js

**Giới thiệu.** Node.js là môi trường thực thi JavaScript phía máy chủ, xây trên engine V8 của Chrome. Điểm đặc trưng là mô hình hướng sự kiện và I/O không chặn (non-blocking): một tiến trình xử lý nhiều kết nối đồng thời mà không tạo thread cho mỗi request. Điều này phù hợp các ứng dụng thiên về chờ mạng, đĩa hoặc dịch vụ bên ngoài hơn là tính toán CPU thuần. Node.js đi kèm hệ sinh thái npm khổng lồ và là nền cho nhiều framework API cũng như công cụ frontend. Nhờ dùng chung ngôn ngữ với trình duyệt, đội ngũ có thể thống nhất kỹ năng fullstack trên một runtime.

**Lý do dùng trong dự án.** Hệ thống vừa phục vụ HTTP REST, vừa giữ kết nối WebSocket phòng thi, vừa gọi LLM và đẩy job chấm — đều là tải I/O-bound. Node.js phù hợp vì cho phép một runtime thống nhất từ API đến tooling agent, đồng thời khớp trực tiếp với NestJS và Next.js đã chọn.

### 2.3. pnpm Workspaces

**Giới thiệu.** pnpm là trình quản lý gói cho JavaScript, khác npm/yarn cổ điển ở cách lưu trữ dependency theo content-addressable store và liên kết bằng hard link. Cơ chế này tiết kiệm dung lượng đĩa và làm cho cấu trúc `node_modules` chặt chẽ hơn, giảm “phantom dependency”. Tính năng **workspaces** cho phép một repository chứa nhiều package, cài đặt chung và khai báo phụ thuộc nội bộ (ví dụ `workspace:*`). Trong monorepo, pnpm giúp mỗi app có ranh giới dependency rõ mà vẫn chia sẻ thư viện dùng chung. Đây là lựa chọn phổ biến khi dự án tách frontend, backend và thư viện dùng chung trong cùng một repo.

**Lý do dùng trong dự án.** ExamCollect không phải một app đơn: cần API, web portal, student agent và package contract dùng chung. pnpm Workspaces phù hợp vì cho phép quản lý nhiều app trong một repo KLTN mà vẫn liên kết được `@cine/shared` và tránh nhân bản dependency giữa các phần.

### 2.4. Turborepo

**Giới thiệu.** Turborepo là hệ thống xây dựng (build system) dành cho monorepo JavaScript/TypeScript. Nó hiểu đồ thị phụ thuộc giữa các package và chạy task như `build`, `test`, `lint` theo thứ tự đúng, có thể song song hóa khi độc lập. Điểm mạnh là cache theo nội dung đầu vào: task không đổi thì tái sử dụng kết quả cũ, rút ngắn thời gian CI và máy local. Turborepo không thay thế package manager mà bổ sung lớp điều phối script ở mức repo. Với dự án nhiều app, nó giảm chi phí “chạy lại toàn bộ” mỗi lần chỉnh một phần nhỏ.

**Lý do dùng trong dự án.** Trong quá trình làm đồ án, thay đổi thường cục bộ (chỉ web hoặc chỉ grading API) nhưng vẫn cần lệnh thống nhất để build/test cả hệ. Turborepo phù hợp vì giúp monorepo chạy task có chọn lọc và tận dụng cache, giữ vòng lặp phát triển chấp nhận được khi số module tăng.

---

## 3. Backend (API)

### 3.1. NestJS

**Giới thiệu.** NestJS là framework xây dựng ứng dụng phía server trên Node.js, lấy cảm hứng từ kiến trúc Angular. Nó tổ chức mã theo module, dùng Dependency Injection để gắn service, controller và provider một cách tường minh. Các khái niệm Guard, Pipe, Interceptor và Exception Filter tạo thành pipeline xử lý request có trật tự: xác thực, phân quyền, validate, biến đổi dữ liệu và bắt lỗi. NestJS hỗ trợ nhiều kênh giao tiếp (HTTP, WebSocket, microservice) trên cùng một nền tảng. Nhờ đó, hệ thống phức tạp vẫn giữ được cấu trúc modular monolith dễ mở rộng theo domain.

**Lý do dùng trong dự án.** ExamCollect cần một backend gom nhiều miền nghiệp vụ (auth, phiên thi, thu bài, chấm AI, kết nối agent) nhưng vẫn tách module rõ. NestJS phù hợp vì DI, guard phân quyền theo vai trò và WebSocket gateway cùng nằm trong một framework — khớp mô hình “một API trung tâm, nhiều use case” của đồ án thay vì tách microservice sớm.

### 3.2. TypeORM

**Giới thiệu.** TypeORM là thư viện Object-Relational Mapping cho TypeScript và JavaScript. Nó ánh xạ class (entity) sang bảng quan hệ thông qua decorator mô tả cột, khóa chính, quan hệ và ràng buộc. Lập trình viên làm việc với đối tượng và repository/query builder thay vì viết toàn bộ SQL thủ công cho CRUD thông thường. TypeORM hỗ trợ migration để tiến hóa schema có kiểm soát theo thời gian. Cách tiếp cận “code-first / entity-driven” giúp schema và mã domain gắn liền nhau trong cùng ngôn ngữ TypeScript.

**Lý do dùng trong dự án.** Schema ExamCollect có nhiều quan hệ cứng và quy tắc toàn vẹn (rubric có phiên bản, submission gắn enrollment, hard delete kèm `RESTRICT`). TypeORM phù hợp vì cho phép khai báo entity làm nguồn chân lý rồi sinh migration có review — vừa đủ linh hoạt cho JSONB kết quả AI, vừa giữ được mô hình quan hệ mà nghiệp vụ giáo dục đòi hỏi.

### 3.3. class-validator & class-transformer

**Giới thiệu.** `class-validator` là thư viện kiểm tra tính hợp lệ của đối tượng dựa trên decorator gắn trên thuộc tính class (ví dụ email, độ dài chuỗi, enum). `class-transformer` chuyển dữ liệu dạng plain object (JSON) sang instance class và ngược lại, phục vụ serialization/deserialization. Trong kiến trúc NestJS, hai thư viện thường kết hợp với `ValidationPipe` để mọi request đi qua một lớp kiểm tra thống nhất trước khi vào service. Cách này đưa quy tắc nghiệp vụ đầu vào gần với định nghĩa DTO. Kết quả là API từ chối dữ liệu sai sớm, với thông báo lỗi có cấu trúc.

**Lý do dùng trong dự án.** Hệ thống nhận nhiều thao tác nhạy cảm (tạo tài khoản vận hành, cấu hình phiên thi, kích hoạt chấm). class-validator/transformer phù hợp vì ép mọi DTO backend tuân thủ cùng một chuẩn validate — song song với Zod phía web — giảm rủi ro dữ liệu lệch làm hỏng phiên thi hoặc pipeline grading.

### 3.4. RxJS

**Giới thiệu.** RxJS (Reactive Extensions for JavaScript) là thư viện lập trình phản ứng dựa trên Observable. Nó mô hình hóa luồng sự kiện hoặc dữ liệu bất đồng bộ như một chuỗi có thể biến đổi bằng operator (map, filter, mergeMap…). Observable khác Promise ở chỗ có thể phát nhiều giá trị theo thời gian và hỗ trợ hủy đăng ký. RxJS phổ biến trong Angular và cũng là nền tảng nội bộ của NestJS cho một số vòng đời request. Hiểu RxJS giúp nắm cách framework kết hợp middleware và luồng bất đồng bộ.

**Lý do dùng trong dự án.** RxJS không phải lựa chọn domain riêng mà là phần runtime chuẩn đi kèm NestJS. Nó phù hợp bối cảnh dự án vì API đã chọn NestJS: giữ stack đồng nhất, tận dụng pipeline interceptor/filter của framework thay vì pha thêm mô hình bất đồng bộ khác.

---

## 4. Cơ sở dữ liệu & lưu trữ

### 4.1. PostgreSQL 16

**Giới thiệu.** PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ mã nguồn mở, tuân thủ ACID và hỗ trợ SQL phong phú. Ngoài bảng–khóa ngoại truyền thống, PostgreSQL cung cấp kiểu JSON/JSONB, index nâng cao, partitioning và trigger. Nhờ đó một hệ thống có thể vừa lưu dữ liệu có cấu trúc chặt, vừa lưu tài liệu bán cấu trúc trong cùng database. PostgreSQL được đánh giá cao về độ tin cậy, tính toàn vẹn tham chiếu và khả năng mở rộng tính năng mà không bỏ mô hình quan hệ. Đây là lựa chọn phổ biến cho ứng dụng nghiệp vụ cần ràng buộc dữ liệu rõ ràng.

**Lý do dùng trong dự án.** Chuỗi nghiệp vụ “học kỳ → lớp → enrollment → phiên thi → bài nộp → điểm” đòi hỏi toàn vẹn tham chiếu và hard delete an toàn. PostgreSQL phù hợp vì vừa giữ quan hệ đó bằng FK, vừa dùng JSONB cho output chấm AI và partitioning cho audit — đúng chỗ ExamCollect cần “vừa quan hệ cứng, vừa linh hoạt tài liệu kết quả”.

### 4.2. Redis

**Giới thiệu.** Redis là kho dữ liệu chủ yếu trong bộ nhớ (in-memory), truy cập rất thấp độ trễ. Nó hỗ trợ nhiều cấu trúc (string, hash, list, set, stream) cùng TTL để dữ liệu tự hết hạn. Redis thường đóng vai trò cache, đếm tỷ lệ, pub/sub, hoặc broker cho hàng đợi công việc. Khác cơ sở dữ liệu quan hệ, Redis tối ưu tốc độ và dữ liệu tạm thời hơn là quan hệ phức tạp lâu dài. Trong kiến trúc hiện đại, Redis thường bổ sung cho PostgreSQL chứ không thay thế hoàn toàn.

**Lý do dùng trong dự án.** Chấm AI và trạng thái “máy agent còn online” là tải tạm thời, cần phản hồi nhanh và không nên nhồi vào bảng quan hệ chính. Redis phù hợp vì là nền cho hàng đợi job và heartbeat phòng thi — tách workload nóng/ngắn hạn khỏi PostgreSQL vốn dành cho sự thật nghiệp vụ lâu dài.

### 4.3. MinIO (S3-compatible)

**Giới thiệu.** MinIO là hệ thống object storage mã nguồn mở, tương thích API Amazon S3. Object storage lưu tệp dưới dạng đối tượng (object) kèm metadata, phù hợp dữ liệu lớn và ít thay đổi cấu trúc hơn hàng trong bảng SQL. MinIO có thể tự host trên máy local hoặc server riêng, giúp môi trường dev giống cloud mà không phụ thuộc ngay dịch vụ trả phí. Client thường dùng SDK S3 và **presigned URL** để cấp quyền tải lên/xuống có thời hạn. Mô hình này tách bạch “metadata trong DB” và “nội dung file trên storage”.

**Lý do dùng trong dự án.** Đề thi và bài nộp (zip, rar, tài liệu) có kích thước lớn và vòng đời khác bản ghi điểm số. MinIO (API S3) phù hợp vì giữ file ngoài Postgres, vẫn dùng được cùng SDK khi chuyển sang storage cloud — đúng nhu cầu thu bài hàng loạt của phòng máy.

### 4.4. MongoDB

**Giới thiệu.** MongoDB là cơ sở dữ liệu hướng tài liệu (document store), lưu bản ghi dạng BSON gần với JSON. Schema linh hoạt: mỗi document trong collection có thể khác cấu trúc ở mức độ nhất định, thuận tiện cho dữ liệu tiến hóa nhanh hoặc log/event. MongoDB mạnh ở truy vấn tài liệu lồng nhau và horizontal scaling theo shard, nhưng không thay thế hoàn toàn ràng buộc quan hệ kiểu SQL. Trong nhiều hệ thống, MongoDB được chọn cho phần “bán cấu trúc” bên cạnh RDBMS. Việc có mặt trong stack không đồng nghĩa mọi nghiệp vụ phải chuyển sang document model.

**Lý do dùng trong dự án.** Một số dữ liệu phụ (log/telemetry mở rộng) có thể không cần mô hình quan hệ đầy đủ như enrollment hay rubric. MongoDB phù hợp là lựa chọn dự phòng trong Compose khi cần lưu document linh hoạt; nghiệp vụ cốt lõi vẫn ở PostgreSQL nên không bị ép schema lỏng cho phần phải chặt.

---

## 5. Xác thực & bảo mật

### 5.1. JWT (JSON Web Token)

**Giới thiệu.** JWT là chuẩn token dạng chuỗi được ký số, gồm ba phần header, payload và signature. Payload mang các claim như định danh người dùng, vai trò và thời điểm hết hạn. Vì token tự chứa thông tin đã ký, máy chủ có thể xác thực request mà không cần lưu session server-side cho mỗi lần gọi (stateless). Thực tế thường dùng access token ngắn hạn kèm refresh token dài hạn để cân bằng bảo mật và trải nghiệm đăng nhập lại. JWT phổ biến trong REST API và SPA vì dễ truyền qua header hoặc cookie.

**Lý do dùng trong dự án.** Portal và API tách process, cần xác thực xuyên request mà vẫn thu hồi được quyền khi xóa tài khoản vận hành. JWT (access + refresh) phù hợp vì cho phép API stateless, đồng thời kết hợp kiểm tra account còn tồn tại — khớp mô hình hard-delete và phân vai admin/teacher của ExamCollect.

### 5.2. Passport.js

**Giới thiệu.** Passport.js là middleware xác thực cho Node.js, thiết kế theo kiểu strategy. Mỗi strategy đóng gói một cơ chế (mật khẩu local, JWT, OAuth nhà cung cấp bên ngoài…) sau cùng một API gắn vào ứng dụng. Nhờ đó lớp “xác thực” tách khỏi logic nghiệp vụ controller. NestJS tích hợp Passport qua `@nestjs/passport` và guard, giúp gắn strategy vào từng route một cách khai báo. Pattern này trở thành chuẩn thực tế cho API Nest cần nhiều lớp bảo vệ.

**Lý do dùng trong dự án.** Hệ thống có ranh giới rõ: giáo viên/admin đăng nhập web, sinh viên không có account portal mà agent đi theo enrollment. Passport phù hợp vì cho phép gắn JWT strategy + guard thống nhất trên API, dễ mở rộng phân quyền theo role mà không viết tay từng nhánh xác thực rời.

### 5.3. argon2id

**Giới thiệu.** Argon2 là thuật toán băm mật khẩu đoạt giải Password Hashing Competition, được thiết kế chống tấn công bằng GPU/ASIC nhờ tiêu tốn bộ nhớ và thời gian có cấu hình. Biến thể **argon2id** kết hợp ưu điểm của argon2i và argon2d, thường được khuyến nghị cho lưu trữ mật khẩu ứng dụng. Khác mã hóa có thể đảo, băm mật khẩu là một chiều: hệ thống chỉ so khớp hash khi đăng nhập. Việc chọn hàm băm hiện đại quan trọng hơn tự viết logic “mã hóa” mật khẩu. Thư viện `argon2` trên Node giúp tích hợp đúng chuẩn này.

**Lý do dùng trong dự án.** Tài khoản admin/teacher là điểm vào vận hành phòng thi và chấm điểm, cần bảo vệ lâu dài. argon2id phù hợp vì là chuẩn băm mật khẩu hiện đại, đáp ứng yêu cầu bảo mật học thuật/thực tiễn của đồ án tốt hơn các lược đồ lỗi thời.

### 5.4. Cookie (httpOnly) & CORS

**Giới thiệu.** Cookie HTTP là cơ chế trình duyệt tự gửi thông tin phiên kèm request cùng domain/điều kiện đã đặt. Cờ **httpOnly** ngăn JavaScript phía trang đọc cookie, giảm thiệt hại khi bị XSS cố đánh cắp token. **CORS** (Cross-Origin Resource Sharing) là chính sách trình duyệt kiểm soát origin nào được gọi API khác nguồn và có kèm credential hay không. Với SPA/portal tách host khỏi API, cấu hình CORS và cookie phải khớp nhau thì đăng nhập mới hoạt động an toàn. Đây là lớp bảo vệ vận hành web, bổ sung cho chữ ký JWT chứ không thay thế phân quyền server.

**Lý do dùng trong dự án.** Web và API chạy khác origin (đặc biệt trong Docker dev), trong khi giáo viên vẫn cần phiên đăng nhập liền mạch trên trình duyệt. httpOnly cookie + CORS credential phù hợp vì giữ token khỏi `localStorage`, đồng thời vẫn cho portal gọi API hợp lệ — khớp mô hình bảo mật “UI chỉ hỗ trợ điều hướng, backend mới enforce”.

---

## 6. Frontend (Web)

### 6.1. Next.js 15 (App Router)

**Giới thiệu.** Next.js là framework React hướng sản phẩm web full-stack, cung cấp định tuyến theo thư mục, render linh hoạt (server/client) và các Route Handler phía server trong cùng dự án. App Router tổ chức UI theo segment layout, giúp tách vùng giao diện và chia sẻ khung trang. Middleware cho phép chặn/điều hướng request sớm dựa trên cookie hoặc header. Next.js còn tối ưu bundling và trải nghiệm deploy cho ứng dụng React. Nó phù hợp portal có nhiều khu vực chức năng hơn là trang marketing tĩnh đơn giản.

**Lý do dùng trong dự án.** ExamCollect cần portal đa vai trò (admin, teacher) và màn exam-live kiểu lobby, kèm lớp proxy auth đặt cookie. Next.js App Router phù hợp vì layout theo route group và middleware/Route Handlers khớp đúng mô hình “một web app, nhiều không gian làm việc + phiên đăng nhập an toàn”.

### 6.2. React 19

**Giới thiệu.** React là thư viện xây giao diện người dùng theo mô hình component và declarative UI: mô tả UI theo trạng thái, thư viện lo việc cập nhật DOM. Luồng dữ liệu một chiều và hooks giúp tách logic giao diện thành đơn vị tái sử dụng. React 19 tiếp tục hướng concurrent rendering và tích hợp tốt hơn với Server Components trong hệ sinh thái Next. Hệ sinh thái React (form, table, query, design system) rất lớn, giảm chi phí tự viết hạ tầng UI. React cũng chạy được trong môi trường desktop nhúng (ví dụ renderer của Electron).

**Lý do dùng trong dự án.** Cùng một đội phải làm portal chấm điểm/thu bài và UI agent trên máy sinh viên. React phù hợp vì dùng chung tư duy component cho web và Electron, đẩy nhanh các màn hình giàu tương tác (form, bảng triage, lobby) mà không đổi paradigm UI giữa các thành phần hệ thống.

### 6.3. Tailwind CSS

**Giới thiệu.** Tailwind CSS là framework CSS theo hướng utility-first: giao diện được dựng bằng các class nguyên tử biểu diễn thuộc tính (khoảng cách, màu, flex, typography…). Thay vì viết nhiều file CSS theo BEM thủ công, lập trình viên compose utility ngay trong markup/JSX. Tailwind hỗ trợ design token qua cấu hình (theme), dễ giữ nhịp thiết kế nhất quán. Khi kết hợp plugin animation và công cụ purge/content scan, CSS sản phẩm chỉ giữ class thực sự dùng. Phong cách này phổ biến với các bộ component kiểu shadcn/ui.

**Lý do dùng trong dự án.** Đồ án có nhiều màn vận hành (tài khoản, phiên thi, submission, grading) cần dựng nhanh nhưng vẫn đồng bộ visual. Tailwind phù hợp vì cho phép tạo UI kit nội bộ và AppShell thống nhất mà không tốn overhead viết stylesheet riêng cho từng trang nghiệp vụ.

### 6.4. Radix UI & shadcn/ui primitives

**Giới thiệu.** Radix UI cung cấp các primitive giao diện “headless”: xử lý hành vi và accessibility (focus trap, keyboard, ARIA) nhưng không ép style cụ thể. shadcn/ui là cách tiếp cận mang component mẫu vào trực tiếp mã nguồn dự án, thường dựng trên Radix + Tailwind + CVA. Khác thư viện UI “hộp đen”, team sở hữu và chỉnh sửa được từng primitive. Cách này cân bằng giữa tốc độ dựng UI và kiểm soát thương hiệu/giao diện. Nó đặc biệt hữu ích khi cần dialog, select, menu đạt chuẩn a11y trong ứng dụng quản trị.

**Lý do dùng trong dự án.** Portal giáo viên/admin nhiều form và hộp thoại thao tác phiên thi — sai accessibility hoặc style lệch sẽ làm UX vận hành kém. Radix + primitive shadcn phù hợp vì vừa đảm bảo hành vi chuẩn, vừa để dự án tùy biến giao diện ExamCollect trong repo thay vì bị khóa bởi theme thư viện đóng.

### 6.5. TanStack Query

**Giới thiệu.** TanStack Query (trước đây React Query) là thư viện quản lý **server state** trên client. Nó đảm nhận cache, refetch, trạng thái loading/error, retry và làm mới dữ liệu sau mutation. Khác global store UI thuần, Query coi dữ liệu từ API là nguồn bất đồng bộ có “độ tươi” (stale time) và chính sách đồng bộ. Nhờ đó giảm boilerplate `useEffect` + `useState` cho mỗi lần gọi mạng. Thư viện hợp với ứng dụng CRUD và dashboard phải giữ UI khớp backend.

**Lý do dùng trong dự án.** Giáo viên liên tục xem danh sách phiên, bài nộp và tiến trình chấm — dữ liệu đổi theo thời gian và sau mỗi thao tác. TanStack Query phù hợp vì giải quyết đúng bài toán đồng bộ server state của portal vận hành, thay vì tự quản lý cache thủ công dễ lệch sau grading/thu bài.

### 6.6. TanStack Table

**Giới thiệu.** TanStack Table là thư viện bảng theo hướng headless: cung cấp mô hình cột, hàng, sort, filter, phân trang nhưng không ép HTML/CSS cụ thể. Lập trình viên tự render UI theo design system của mình. Cách này linh hoạt hơn component table “có sẵn theme” khi giao diện hoặc hành vi hàng loạt rất đặc thù. Table headless đặc biệt hợp dữ liệu dạng danh sách nghiệp vụ cần tùy biến ô và hành động theo từng cột. Nó thường đi cùng React trong các console quản trị.

**Lý do dùng trong dự án.** ExamCollect xoay quanh danh sách dày: tài khoản, roster, submission triage, bảng điểm. TanStack Table phù hợp vì cho phép dựng bảng đúng UI dự án (kèm thao tác hàng loạt) mà không bị khung giao diện cố định cản trở quy trình giáo viên.

### 6.7. React Hook Form + Zod

**Giới thiệu.** React Hook Form là thư viện quản lý form nhấn mạnh hiệu năng: đăng ký input và giảm re-render không cần thiết so với kiểm soát toàn bộ field bằng state React thuần. Zod là thư viện khai báo schema và parse dữ liệu với suy luận kiểu TypeScript mạnh. Khi kết hợp qua resolver, cùng một schema vừa validate vừa hỗ trợ kiểu cho giá trị form. Mô hình này đưa “hợp đồng dữ liệu” gần UI, bắt lỗi trước khi gọi API. Cặp RHF + Zod phổ biến trong ứng dụng TypeScript hiện đại.

**Lý do dùng trong dự án.** Nhiều thao tác quyết định vận hành (đăng nhập, tạo phiên, cấu hình nộp bài) không chấp nhận dữ liệu mơ hồ. RHF + Zod phù hợp vì cho phép form phía web phản ánh cùng kỷ luật validate với DTO backend, giảm vòng thử–sai khi giáo viên/admin nhập liệu phức tạp.

### 6.8. GSAP

**Giới thiệu.** GSAP (GreenSock Animation Platform) là thư viện tạo chuyển động trên web bằng timeline và tween có kiểm soát cao. Nó cho phép lập trình animation mượt, đồng bộ nhiều thuộc tính và xử lý trình tự phức tạp hơn CSS transition đơn giản trong nhiều tình huống. GSAP không gắn với một framework UI cụ thể nhưng có binding chính thức cho React. Trong sản phẩm, animation thường dùng để tạo hierarchy thị giác và phản hồi tương tác, không thay logic nghiệp vụ. Việc dùng có chủ đích giúp giao diện “có mặt” mà không gây nhiễu.

**Lý do dùng trong dự án.** Lobby exam-live mang tính trình chiếu/theo dõi phòng thi, cần cảm giác tức thời và rõ ràng hơn trang CRUD thông thường. GSAP phù hợp vì bổ sung chuyển động có chủ đích cho các màn hình đó, làm nổi bật trạng thái phiên mà không đụng vào lõi thu bài hay chấm điểm.

### 6.9. ExcelJS / SheetJS (xlsx)

**Giới thiệu.** ExcelJS và SheetJS (xlsx) là thư viện đọc/ghi tệp spreadsheet định dạng Excel phổ biến. Chúng cho phép ứng dụng web hoặc Node tạo file `.xlsx`, đọc hàng/cột và xử lý workbook mà không bắt buộc cài Microsoft Excel. Trong phần mềm quản lý giáo dục và nhân sự, Excel vẫn là định dạng trao đổi quen thuộc với người dùng cuối. Thư viện spreadsheet cầu nối giữa hệ thống số hóa và quy trình giấy tờ/file đang tồn tại ở trường lớp. Việc hỗ trợ import/export giảm ma sát triển khai thực tế.

**Lý do dùng trong dự án.** Giáo viên và nhà trường vốn làm việc với danh sách lớp và bảng điểm dạng Excel. ExcelJS/SheetJS phù hợp vì giúp ExamCollect nhập roster và xuất điểm trong đúng “ngôn ngữ tệp” của người dùng, thay vì buộc mọi thao tác chỉ qua giao diện web.

---

## 7. Student Agent

### 7.1. Electron

**Giới thiệu.** Electron là nền tảng xây ứng dụng desktop bằng web technology: kết hợp Chromium (giao diện) và Node.js (quyền hệ thống). Một codebase HTML/CSS/JS (hoặc React) có thể đóng gói chạy trên Windows, macOS, Linux. Khác tab trình duyệt thông thường, app Electron truy cập filesystem, tray và tiến trình local trong phạm vi quyền được cấp. Mô hình gồm process chính (main) và process giao diện (renderer), giao tiếp qua preload/IPC. Electron phù hợp khi cần “app máy trạm” nhưng muốn tái sử dụng kỹ năng web.

**Lý do dùng trong dự án.** Thu bài đúng file trên máy phòng máy đòi hỏi quyền ghi/đọc local và kết nối dài hạn với server — trình duyệt kiosk thông thường không đủ và lockdown OS nằm ngoài phạm vi đồ án. Electron phù hợp vì cho ra agent desktop nhẹ, UI quen web, đúng bài toán “máy sinh viên chủ động kết nối và nộp bài” của ExamCollect.

### 7.2. electron-vite & electron-builder

**Giới thiệu.** electron-vite là công cụ dựng dự án Electron trên nền Vite, tách cấu hình cho main, preload và renderer với HMR thuận tiện khi phát triển. electron-builder đảm nhiệm đóng gói phân phối: tạo installer hoặc bản portable theo từng hệ điều hành. Bộ đôi này tách giai đoạn “code nhanh lúc dev” và “xuất bản phẩm chạy được trên máy thật”. Trong môi trường phòng máy, định dạng portable thường giảm ma sát cài đặt quyền admin. Tooling tốt giúp app desktop không trở thành gánh nặng vận hành so với chính logic nghiệp vụ.

**Lý do dùng trong dự án.** Agent phải vừa iterate nhanh khi làm đồ án, vừa triển khai được hàng loạt máy Windows phòng thi. electron-vite + electron-builder phù hợp vì rút ngắn vòng dev và tạo bản portable — khớp ràng buộc hạ tầng phòng máy vốn hạn chế cài đặt phức tạp.

### 7.3. Vite

**Giới thiệu.** Vite là công cụ phát triển và đóng gói frontend hiện đại, dùng native ESM trong lúc dev để khởi động và HMR nhanh. Khi build production, Vite dựa trên Rollup để tối ưu bundle. Nó hỗ trợ React và nhiều framework qua plugin, trở thành chuẩn thay thế dần một số cấu hình bundler nặng trước đây. Vite không phải runtime ứng dụng mà là lớp tooling cho mã trình duyệt/renderer. Hệ sinh thái test (Vitest) cũng gắn liền với Vite, tạo chuỗi công cụ thống nhất.

**Lý do dùng trong dự án.** Renderer của agent (và toolchain liên quan) cần vòng phản hồi UI nhanh giống web hiện đại. Vite phù hợp vì khớp React/Electron tooling của dự án và giữ trải nghiệm phát triển agent gần với portal Next/React thay vì cấu hình desktop cổ điển nặng nề.

---

## 8. Thời gian thực & hàng đợi

### 8.1. Socket.IO

**Giới thiệu.** Socket.IO là thư viện giao tiếp thời gian thực trên nền WebSocket (và cơ chế dự phòng khi môi trường hạn chế). Nó bổ sung khái niệm event có tên, room/namespace và hỗ trợ reconnect — những thứ WebSocket thuần không chuẩn hóa sẵn. Client và server trao đổi thông điệp đẩy (push) thay vì client phải hỏi định kỳ. Socket.IO phổ biến cho dashboard live, chat, và điều phối thiết bị/máy trạm. Trong NestJS, gateway Socket.IO gắn trực tiếp vào kiến trúc module hiện có.

**Lý do dùng trong dự án.** Lobby phòng thi và agent cần cập nhật trạng thái máy/nộp bài theo giây, không chấp nhận độ trễ của polling HTTP. Socket.IO phù hợp vì cung cấp kênh đẩy có room theo phiên thi và reconnect khi máy lab mạng không ổn định — đúng đặc thù vận hành realtime của ExamCollect.

### 8.2. BullMQ

**Giới thiệu.** BullMQ là hệ thống hàng đợi công việc (job queue) chạy trên Redis cho Node.js. Nó cho phép đưa tác vụ nặng vào nền: worker lấy job, xử lý, retry khi lỗi, trì hoãn hoặc giới hạn độ song song. Tách request HTTP khỏi công việc dài giúp API phản hồi nhanh và chịu lỗi tốt hơn. Queue còn là điểm kiểm soát trạng thái pipeline (chờ, đang chạy, thất bại). Kiểu kiến trúc này phổ biến với xử lý ảnh, gửi email hàng loạt, và các pipeline AI nhiều bước.

**Lý do dùng trong dự án.** Một lần chấm AI có thể gồm nhiều bước (sandbox, gọi LLM, phân tích theo rubric) kéo dài và dễ cần retry. BullMQ phù hợp vì biến grading thành job nền có kiểm soát — giáo viên không bị treo UI/API, đồng thời khớp thiết kế “AI hỗ trợ, chạy hàng loạt theo phiên”.

---

## 9. AI & chấm điểm

### 9.1. Anthropic SDK (Claude)

**Giới thiệu.** Anthropic SDK là bộ thư viện chính thức để ứng dụng gọi các mô hình ngôn ngữ lớn Claude qua API. LLM hiện đại có khả năng hiểu ngữ cảnh dài, làm theo hướng dẫn và (trong một số chế độ) dùng công cụ để hỗ trợ suy luận. SDK đóng gói xác thực, định dạng tin nhắn và tùy chọn sinh nội dung, giúp tích hợp mô hình vào backend thay vì tự viết HTTP thấp cấp. Trong hệ thống phần mềm, LLM thường đóng vai trò hỗ trợ quyết định chứ không thay lớp luật xác định hoàn toàn. Việc bọc provider sau một interface giúp đổi mô hình hoặc mock khi kiểm thử.

**Lý do dùng trong dự án.** Chấm theo rubric với bài làm đa dạng (code/văn bản) vượt quá rule khớp máy thuần. Claude qua Anthropic SDK phù hợp vì cung cấp năng lực ngữ nghĩa để *đề xuất* điểm và bằng chứng, đúng định hướng AI-assisted (giáo viên chốt cuối) của ExamCollect thay vì chấm hộ hoàn toàn.

### 9.2. Docker sandbox (thực thi mã)

**Giới thiệu.** Sandbox là môi trường thực thi cô lập, giới hạn tài nguyên và quyền của mã không đáng tin cậy. Với bài thi lập trình, mã sinh viên có thể lỗi, vòng lặp vô hạn hoặc hành vi nguy hiểm nếu chạy trực tiếp trên máy chủ chấm. Docker dùng container và image theo ngôn ngữ để tạo sandbox tái lập được: cùng toolchain, giới hạn CPU/RAM/mạng. Worker bên ngoài điều phối chạy test và thu thập kết quả. Đây là lớp an toàn và xác định (deterministic) bổ sung trước/kèm phân tích AI.

**Lý do dùng trong dự án.** Một phần đề thi hướng DSA/code cần chạy thử nghiệm thật trên bài nộp. Docker sandbox phù hợp vì cho phép chấm thực thi an toàn, tách khỏi host API — điều kiện bắt buộc nếu muốn tin cậy kết quả kiểm thử trong pipeline grading của đồ án.

### 9.3. Xử lý tài liệu nộp (JSZip, yauzl, mammoth, docx, node-unrar-js)

**Giới thiệu.** Nhóm thư viện này xử lý tệp văn phòng và archive phổ biến trên Node.js. JSZip/yauzl đọc và giải nén ZIP; `node-unrar-js` hỗ trợ RAR; `mammoth` chuyển Word sang dạng dễ xử lý; `docx` hỗ trợ sinh tài liệu Word. Chúng nằm ở tầng “ingest”: biến file người dùng thành nội dung chương trình đọc được. Trong hệ thống giáo dục, đầu vào hiếm khi chỉ là JSON sạch mà thường là gói nộp và đề dạng Office. Thư viện chuyên dụng giảm rủi ro tự parse binary sai chuẩn.

**Lý do dùng trong dự án.** Bài nộp và ngân hàng đề của ExamCollect đến từ đúng thực tế phòng máy: zip source, rar, đề Word. Bộ thư viện này phù hợp vì mở được các định dạng đó trước khi đưa vào rubric/LLM — thiếu chúng thì pipeline thu bài–chấm không khép được vòng với dữ liệu thật.

---

## 10. Hợp đồng API & chia sẻ kiểu

### 10.1. OpenAPI / Swagger (`@nestjs/swagger`)

**Giới thiệu.** OpenAPI là đặc tả máy-đọc được cho HTTP API: đường dẫn, tham số, schema dữ liệu và cơ chế xác thực. Swagger UI là giao diện trực quan sinh từ đặc tả để thử endpoint. Trong NestJS, `@nestjs/swagger` (kèm CLI plugin) có thể suy ra phần lớn tài liệu từ DTO và decorator sẵn có. Một hợp đồng OpenAPI trở thành cầu nối giữa backend và các client (web, script, partner). Cách tiếp cận “REST có schema” đứng giữa tài liệu viết tay dễ lệch và các stack RPC ý kiến mạnh hơn (GraphQL/tRPC).

**Lý do dùng trong dự án.** Web và API phát triển song song trong monorepo, dễ lệch field nếu chỉ dựa tài liệu miệng. OpenAPI/Swagger phù hợp vì biến Nest thành nguồn hợp đồng duy nhất — đủ hình thức cho đồ án, đủ thực dụng để sinh client typed mà không đổi sang GraphQL.

### 10.2. openapi-typescript + openapi-fetch (`packages/shared`)

**Giới thiệu.** `openapi-typescript` đọc đặc tả OpenAPI và sinh định nghĩa TypeScript tương ứng cho paths và schema. `openapi-fetch` là client HTTP mỏng, dùng các kiểu đó để gọi API có kiểm tra kiểu lúc biên dịch. Kết hợp lại tạo thành quy trình “spec → types → client” giảm lệch giữa server và consumer. Package shared trong monorepo thường xuất client này cho app web. Đây là hình thức codegen nhẹ, không buộc cả stack phải dùng tRPC end-to-end.

**Lý do dùng trong dự án.** Mỗi lần mở rộng session/grading, UI phải theo đúng payload API. openapi-typescript + openapi-fetch phù hợp vì khóa contract giữa Nest và Next trong `@cine/shared`, phát hiện lệch kiểu sớm — rất hợp monorepo KLTN nơi hai phía đổi liên tục.

---

## 11. Hạ tầng & triển khai

### 11.1. Docker & Docker Compose

**Giới thiệu.** Docker đóng gói ứng dụng cùng dependency vào image, chạy trong container cô lập với máy host. Docker Compose mô tả nhiều service (app, database, cache, storage) trong một file YAML và khởi chạy đồng bộ bằng một lệnh. Cách này tái lập môi trường giữa các máy phát triển và gần với triển khai thật. Compose đặc biệt hữu ích khi hệ thống phụ thuộc nhiều datastore cùng lúc. Container hóa cũng là nền cho sandbox thực thi mã và kiểm thử độc lập.

**Lý do dùng trong dự án.** ExamCollect cần Postgres, Redis, MinIO (và dịch vụ phụ) trước khi API/web có ý nghĩa end-to-end. Docker Compose phù hợp vì dựng được “phòng lab phần mềm” giống nhau cho mọi thành viên, đồng thời tách DB e2e khỏi DB dev — điều kiện để phát triển và kiểm thử ổn định trong đồ án nhiều thành phần.

### 11.2. Triển khai cloud (Vercel, Railway, Supabase)

**Giới thiệu.** Vercel là nền tảng triển khai tối ưu cho ứng dụng frontend/Next.js, nhấn mạnh preview và CDN edge. Railway là PaaS chạy service backend/container với quy trình deploy đơn giản hơn tự quản lý VPS. Supabase cung cấp Postgres quản trị sẵn và các dịch vụ kèm theo (trong đó có hướng storage tương thích nhu cầu file). Việc tách host theo đặc thù từng tầng (web / API / data) là xu hướng cloud hiện đại. Với đồ án, managed service giảm gánh vận hành hạ tầng thuần túy.

**Lý do dùng trong dự án.** Nhóm cần demo và triển khai thật nhưng không nên dồn công sức vào quản trị server. Vercel + Railway + Supabase phù hợp vì mỗi tầng ExamCollect (Next, Nest, Postgres/storage) đặt đúng chỗ sở trường của dịch vụ — tối ưu thời gian đồ án cho nghiệp vụ thu bài–chấm thay vì devops nặng.

---

## 12. Kiểm thử

### 12.1. Jest + Supertest (API)

**Giới thiệu.** Jest là khung kiểm thử JavaScript/TypeScript phổ biến: chạy unit test, mock và báo cáo kết quả. Supertest cho phép gửi HTTP request vào ứng dụng Express/Nest đang chạy trong process test và khẳng định status/body. Kết hợp lại, backend có thể kiểm thử cả logic service lẫn hành vi HTTP thật. Với hệ dùng database, bộ e2e thường trỏ tới DB tách biệt để không phá dữ liệu dev. Kiểm thử tự động là lớp bảo vệ khi refactor module lớn.

**Lý do dùng trong dự án.** Ràng buộc FK, auth và luồng tài khoản/phiên thi sai là rủi ro trực tiếp tới thu bài. Jest + Supertest phù hợp vì cho phép e2e API trên Postgres riêng — chứng minh nghiệp vụ cốt lõi vẫn đúng khi schema và guard thay đổi xuyên suốt đồ án.

### 12.2. Vitest + Testing Library (Web / Agent)

**Giới thiệu.** Vitest là test runner tương thích tinh thần Jest nhưng gắn với Vite, khởi chạy nhanh và cấu hình gọn cho dự án frontend hiện đại. Testing Library khuyến khích kiểm thử giao diện theo cách người dùng nhìn thấy (vai trò, nhãn) thay vì chi tiết triển khai component. Cặp này phù hợp React: xác nhận form, trạng thái và tương tác quan trọng. Trong app Electron, cùng runner có thể phủ logic/UI renderer. Mục tiêu là bắt lỗi UX/logic sớm trước khi vào phòng máy thật.

**Lý do dùng trong dự án.** Portal và agent đều là mặt tiếp xúc người dùng cuối của quy trình thi. Vitest + Testing Library phù hợp vì khớp toolchain Vite/React đã chọn và tập trung kiểm thử hành vi màn hình quan trọng — nơi lỗi UI cũng làm gãy thao tác giáo viên/sinh viên.

### 12.3. ESLint + TypeScript ESLint

**Giới thiệu.** ESLint là công cụ phân tích mã tĩnh, phát hiện anti-pattern và ép convention trước khi code vào nhánh chính. `@typescript-eslint` bổ sung rule hiểu cú pháp và hệ kiểu TypeScript, vượt khả năng ESLint thuần cho JS. Lint không thay thế test nhưng giảm nợ kỹ thuật và sai lệch phong cách trong team. Trong monorepo, chạy lint theo từng package giúp giữ chất lượng đồng đều. Đây là lớp “vệ sinh kỹ thuật” song song với compiler TypeScript.

**Lý do dùng trong dự án.** Repo nhiều app và nhiều module domain dễ phân hóa style/chất lượng rất nhanh trong thời gian làm KLTN. ESLint + TypeScript ESLint phù hợp vì tạo hàng rào thống nhất trên api/web/agent, giữ codebase đọc được khi liên tục mở rộng grading và thu bài.

---

## Bảng tra cứu nhanh

| Công nghệ | Lớp | Vì sao phù hợp ExamCollect (một dòng) |
| --- | --- | --- |
| TypeScript / Node.js | Nền tảng | Domain dày + tải I/O; một ngôn ngữ cho cả hệ |
| pnpm + Turborepo | Monorepo | Nhiều app một repo, build/test có chọn lọc |
| NestJS + TypeORM | API | Modular monolith + schema quan hệ có migration |
| PostgreSQL | Data | Toàn vẹn nghiệp vụ thi + JSONB kết quả AI |
| Redis + BullMQ | Async | Job chấm dài + trạng thái tạm phòng thi |
| MinIO + AWS S3 SDK | Object storage | File đề/bài nộp lớn, tách khỏi DB |
| JWT + Passport + argon2 | Auth | Phiên stateless, phân vai, mật khẩu an toàn |
| Socket.IO | Realtime | Lobby & agent cần push theo phiên |
| Next.js + React + Tailwind | Web | Portal đa vai trò, UI vận hành nhanh |
| TanStack Query/Table + RHF + Zod | Web data/UI | Dashboard/form/bảng đúng bài toán giáo viên |
| Electron | Agent | Quyền máy local để thu bài phòng máy |
| Anthropic SDK | AI | Đề xuất điểm theo rubric (AI-assisted) |
| Docker Compose | Infra | Tái lập đủ datastore cho dev/e2e |
| OpenAPI → shared client | Contract | Khóa khớp Nest ↔ Next khi đổi liên tục |
| Jest / Vitest | Test | Bảo vệ API quan hệ và UI then chốt |

---

## Ghi chú phạm vi

- Hệ thống **không** phải giải pháp giám sát/chống gian lận kiểu lockdown OS; stack chọn để **thu bài đúng hạn + hỗ trợ chấm AI**, giáo viên chốt điểm cuối.
- MongoDB trong Compose là hạ tầng dự phòng; nghiệp vụ cốt lõi đi qua PostgreSQL.
- Chi tiết nghiệp vụ và schema: xem `README.md`, `docs/grading-system-guide.md`, và các spec trong `docs/superpowers/specs/`.
