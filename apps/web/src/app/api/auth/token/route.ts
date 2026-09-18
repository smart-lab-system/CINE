import { NextRequest, NextResponse } from 'next/server';

/**
 * Trao `access_token` đang có cho JS của chính origin này.
 *
 * Vì sao cần: từ khi frontend chuyển sang Bearer, token phải nằm trong JS để
 * đính vào header `Authorization` và `handshake.auth` — nhưng nó được lưu
 * trong cookie httpOnly, mà JS theo định nghĩa không đọc được. Endpoint này
 * là cây cầu duy nhất, và nó chạy trên CÙNG origin nên cookie tới được.
 *
 * Vì sao KHÔNG dùng `/api/auth/refresh` cho việc này: refresh XOAY refresh
 * token. Bootstrap sau mỗi lần F5 bằng refresh nghĩa là xoay token mỗi lần
 * tải trang, và hai tab mở gần nhau sẽ đăng xuất lẫn nhau — tab thứ hai xoay
 * và vô hiệu hoá cặp mà tab thứ nhất vừa nhận. Endpoint này chỉ ĐỌC.
 *
 * Phơi bày access token ra JS là đánh đổi cố ý của hướng Bearer, không phải
 * sơ suất. Giới hạn của nó: token sống 15 phút (ACCESS_TOKEN_TTL), và
 * `refresh_token` KHÔNG BAO GIỜ đi qua đây — nó ở lại httpOnly, nên một lỗ
 * XSS lấy được tối đa 15 phút chứ không phải 7 ngày.
 *
 * Không có access token là câu trả lời BÌNH THƯỜNG, không phải lỗi: ở màn
 * đăng nhập thì đúng là chưa có. 401 để client biết mà đi tiếp, không phải
 * để báo sự cố.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value;

  if (!accessToken) {
    // Cookie access_token hết hạn sau 15 phút trong khi refresh_token sống 7
    // ngày, nên "không có" ở đây thường nghĩa là phiên còn cứu được. Việc cứu
    // thuộc về đường 401-retry trong api-client.ts (nó gọi /api/auth/refresh)
    // — không làm ở đây, để endpoint này giữ đúng một trách nhiệm và không
    // bao giờ xoay token.
    return NextResponse.json({ message: 'No access token' }, { status: 401 });
  }

  return NextResponse.json({ accessToken });
}
