# G2–G5: lượt kiểm trên trình duyệt (browser pass) — giao thức chung

Ngày: 2026-10-01 · Bổ sung cho `2026-09-29-g2-g5-parallel-execution.md`. Cả bốn plan G2–G5 ghi *"No browser pass"* ở mục "chưa chứng minh". Chủ dự án (2026-10-01) yêu cầu **mỗi plan phải có một lượt chạy Playwright thật** bằng server ở `C:\Users\Admin\.mcp\playwright-local\server.mjs`. Lượt này chạy **sau** khi mọi task của plan xanh và **trước** báo cáo cuối, và nó **không thay** test: nó kiểm đúng chỗ mà test không chạm — chỗ nối giữa client sinh ra từ OpenAPI và trang thật.

## 1. Công cụ — `docs/superpowers/tools/pw-mcp.mjs`

Server Playwright ở `.mcp` là một MCP stdio. Nó **chưa được đăng ký** làm MCP của phiên Claude, và biến môi trường trong `mcp-common.json` trỏ tới đường dẫn của một người dùng khác (`henry-le-nguyen`) nên không chạy nguyên trạng. `pw-mcp.mjs` là một client mỏng: nó chạy **đúng `server.mjs` đó**, chỉ đặt `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH` sang bản `playwright` trong `node_modules/.pnpm` của worktree (1.60.0; Chromium 1223 đã cài ở `%LOCALAPPDATA%\ms-playwright`).

```js
// chạy bằng `node` từ thư mục worktree: node ../../.superpowers/browser-pass/g3.mjs   (hoặc đường dẫn tuyệt đối)
import { startPlaywrightMcp } from '<đường dẫn tuyệt đối tới worktree>/docs/superpowers/tools/pw-mcp.mjs';
const pw = await startPlaywrightMcp({ artifactsDir: '<worktree>/.superpowers/browser-pass/artifacts' });
try {
  await pw.call('open_playwright_page', { url: 'http://localhost:3003/login', headless: true }); // CHỈ http/https
  await pw.call('type_playwright', { label: 'Email', text: 'browser@example.test' });
  await pw.call('type_playwright', { label: 'Mật khẩu', text: 'BrowserPass1!' });
  await pw.call('click_playwright', { role: 'button', name: 'Đăng nhập' });
  await pw.call('wait_for_playwright', { textQuery: 'Chấm điểm', timeoutMs: 15000 });
  await pw.call('screenshot_playwright', { fileName: '01-login.png' });
  console.log(await pw.call('read_playwright_page', { maxChars: 4000 }));
  console.log(await pw.call('get_playwright_console', {}));   // lỗi console + lỗi trang
  console.log(await pw.call('get_playwright_network', {}));   // request hỏng / 4xx / 5xx
} finally { await pw.close(); }
```

Tên và tham số công cụ: `await pw.tools()` (52 công cụ; mọi công cụ nhận `role`+`name`, `label`, `textQuery`, `selector`, `testId`, `nth`). Ảnh lưu vào `artifactsDir`. Đặt script và ảnh dưới `.superpowers/browser-pass/` (thư mục bị ignore) — **không commit**.

## 2. Dựng môi trường — cổng riêng mỗi gói

| Gói | API | Web |
|---|---|---|
| G2 | 4002 | 3002 |
| G3 | 4003 | 3003 |
| G4 | 4004 | 3004 |
| G5 | 4005 | 3005 |

```bash
# API: bản đã build, nạp .env.test (DB + Redis db riêng của gói), cho phép origin của web gói này
pnpm --filter api build
cd apps/api && PORT=4003 WEB_ORIGIN=http://localhost:3003 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js   # nền
# Web: dev server trỏ vào API của gói
cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:4003 pnpm exec next dev -p 3003                                              # nền
```

**Hai điều giao thức ban đầu thiếu (mọi phiên G2–G5 vấp phải):** (a) route proxy `/api/auth/login` và `/refresh` của web đọc `API_URL` (mặc định cổng 4000), KHÁC `NEXT_PUBLIC_API_URL` — phải đặt CẢ HAI khi chạy `next dev`, nếu không đăng nhập báo "Sai email hoặc mật khẩu" dù tài khoản đúng; form đăng nhập submit trước khi hydrate còn rơi về GET và đưa mật khẩu lên URL (lỗi có sẵn), nên chờ trang hydrate xong rồi mới gõ; (b) `findRepoPlaywright()` có thể không thấy gói `playwright` trong `.pnpm` của worktree (chỉ có link `playwright-core`) — khi đó đặt `PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH` trỏ vào `playwright@<ver>/node_modules/playwright/index.mjs` của một worktree có đủ (chỉ đọc). `TaskStop` trên `pnpm exec next dev` có thể bỏ sót tiến trình con đang nghe cổng: dừng nó theo PID sau khi kiểm đúng tiến trình đó chiếm cổng của mình.

`PORT`, `WEB_ORIGIN` đặt trước thắng `.env.test` (dotenv không ghi đè biến đã có). Đợi `curl -s -o /dev/null -w '%{http_code}' http://localhost:4003/api-docs-json` ra 200 và trang `http://localhost:3003/login` mở được (lần biên dịch đầu của `next dev` chậm). **Tắt cả hai bằng `TaskStop` khi xong.** Không bao giờ trỏ web vào API của gói khác hay vào cổng 4000.

## 3. Dữ liệu — dựng bằng một spec e2e dùng một lần, KHÔNG viết INSERT tay

Không có `/auth/register` (tài khoản chèn thẳng vào DB). Cách đúng là tái dùng chính helper của e2e, vì chúng đã đi đúng vòng đời (trigger của `grading_result` và `submission` ép từng bước — xem CLAUDE.md "Hai máy trạng thái này được DB ÉP"):

1. Tạo `apps/api/test/zz-browser-seed.e2e-spec.ts` (**không `git add`**; luôn `git add <đường dẫn cụ thể>`, không bao giờ `git add -A`/`.`). Spec khởi động `AppModule`, gọi `createTestAccount(ds, { email: 'browser@example.test', password: 'BrowserPass1!', role: 'teacher' })` rồi dùng helper seed **của chính plan** (`grading-seed.ts`, `investigator-seed.ts`, `grade-export-seed.ts`, …) để dựng đúng trạng thái màn hình cần xem; in id cần thiết ra `.superpowers/browser-pass/seed.json`.
2. Chạy: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/zz-browser-seed.e2e-spec.ts`. e2e **không tự dọn** nên dữ liệu ở lại trong `examcollect_gN` cho trình duyệt dùng.
3. Đăng nhập trên web bằng tài khoản đó. Trang đăng nhập: nhãn `Email`, `Mật khẩu`, nút `Đăng nhập`.

**Tuyệt đối không gọi AI thật**: `.env.test` không khai khoá nào nên chuỗi chấm rơi về `KeywordGradingProvider` (0 token). Nếu một luồng cần AI, dựng sẵn hàng trong DB bằng helper thay vì bấm nút kích hoạt gọi mạng.

## 4. Một lượt phải làm gì

Với **mỗi task web** của plan (mỗi màn hình hoặc hành vi mới/đổi): một kịch bản gồm
1. dựng đúng trạng thái dữ liệu mà task giả định (kể cả trạng thái rỗng/lỗi mà task nói tới);
2. mở trang thật, làm đúng đường chính của người dùng, **chụp ảnh ở mỗi bước đáng chú ý**;
3. khẳng định bằng `expect_playwright`/`read_playwright_page` những câu chữ, nút bật/tắt, số đếm mà plan hứa (copy nguyên văn từ test, không diễn đạt lại);
4. đọc `get_playwright_console` và `get_playwright_network`: **không** có lỗi console, không có request 4xx/5xx ngoài ý muốn. Một 400/409 mà kịch bản cố ý gây ra thì ghi rõ là cố ý.

Đường API đi qua client sinh ra (`schema.d.ts`) là thứ lượt này được lập ra để chạm: nếu client gọi sai đường dẫn/kiểu, TypeScript đã bắt; nếu server trả khác kiểu đã khai (ví dụ `null` ở chỗ kiểu nói `string`), chỉ trình duyệt thấy.

**Gặp lỗi:** sửa gốc (viết test đỏ trước nếu lỗi nằm ở mã), chạy lại các test liên quan, rồi chạy lại **cả kịch bản bị ảnh hưởng**. Không "khắc phục" bằng cách làm lỏng khẳng định.

## 5. Báo cáo

Trong báo cáo cuối của phiên và trong `docs/superpowers/ledgers/2026-09-29-<gói>.md` thêm mục **Browser pass**: danh sách kịch bản (đạt/không đạt), đường dẫn ảnh (ngoài repo, trong `.superpowers/browser-pass/artifacts`), lỗi tìm thấy và cách xử lý, và những gì **vẫn chưa** được kiểm bằng trình duyệt. Nếu không thể chạy được (môi trường hỏng), nói thẳng *"browser pass chưa chạy vì …"* — không viết "đã kiểm" khi chưa.
