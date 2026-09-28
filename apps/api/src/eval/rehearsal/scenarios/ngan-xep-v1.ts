import type { RehearsalScenario } from '../score-run';

const L = (...lines: string[]) => [...lines, ''].join('\n');

/**
 * Ngăn xếp bằng danh sách liên kết (CTDL&GT, C++). Năm bài, mỗi bài một đường của hệ thống.
 * Hành vi từng bài đã chạy kiểm bằng image `cine-sandbox-cpp:1` (2026-09-28): HS2410018 chỉ
 * trượt ca `bien`; HS2410020 trượt `co_ban` lẫn `bien`; HS2410021 đạt đủ 4 ca nhưng in `3 2 1`
 * với input `3\n7 8 9`; HS2410019 và HS2410022 đạt mọi ca.
 */
export const NGAN_XEP_V1: RehearsalScenario = {
  id: 'ngan-xep-v1',
  rubric: {
    name: 'CTDL&GT — Ngăn xếp bằng danh sách liên kết (diễn tập)',
    criteria: [
      { key: 'dung_dan', description: 'Tính đúng đắn: kết quả đúng trên mọi ca của đề, kể cả ca biên', maxPoints: 6 },
      { key: 'trinh_bay', description: 'Trình bày: tên gợi nghĩa, có chú thích cấu trúc dữ liệu và thuật toán', maxPoints: 2 },
      { key: 'quan_ly_bo_nho', description: 'Quản lý bộ nhớ: mọi vùng cấp phát động đều được giải phóng', maxPoints: 2 },
    ],
  },
  rules: [
    { ruleKey: 'sai_ca_co_ban', name: 'Sai ca cơ bản', criterionKey: 'dung_dan', predicate: { kind: 'test_group_failed', group: 'co_ban' }, price: '3',
      description: 'Chương trình cho kết quả sai trên nhóm ca cơ bản của đề.' },
    { ruleKey: 'sai_ca_bien', name: 'Sai ca biên', criterionKey: 'dung_dan', predicate: { kind: 'test_group_failed', group: 'bien' }, price: '1.5',
      description: 'Chương trình cho kết quả sai trên nhóm ca biên (giá trị lớn, tràn số).' },
    { ruleKey: 'ten_bien_vo_nghia', name: 'Tên biến không gợi nghĩa', criterionKey: 'trinh_bay', predicate: null, price: '0.5',
      description: 'Tên biến, tên kiểu, tên trường chỉ một-hai chữ cái không gợi nghĩa (a, x, t, p, N, v, n...), trừ biến đếm vòng lặp i/j/k.' },
    { ruleKey: 'thieu_chu_thich', name: 'Thiếu chú thích', criterionKey: 'trinh_bay', predicate: null, price: '0.5',
      description: 'Không có chú thích nào giải thích cấu trúc dữ liệu đã dùng hay các bước chính của thuật toán.' },
    { ruleKey: 'ro_ri_bo_nho', name: 'Rò rỉ bộ nhớ', criterionKey: 'quan_ly_bo_nho', predicate: null, price: '1',
      description: 'Cấp phát động bằng new mà không có delete tương ứng cho mọi nút trước khi chương trình kết thúc.' },
  ],
  question: L(
    'Đề bài (CTDL&GT — ngăn xếp): Cài đặt ngăn xếp bằng danh sách liên kết đơn.',
    'Dòng 1: số nguyên n (0 ≤ n ≤ 1000). Dòng 2: n số nguyên a_i (|a_i| ≤ 10^12).',
    'Đẩy lần lượt từng a_i vào ngăn xếp, rồi lấy ra hết và in các giá trị theo thứ tự lấy ra, cách nhau một dấu cách, trên một dòng.',
    'Yêu cầu: dùng danh sách liên kết tự cài đặt (không dùng std::stack), giải phóng mọi nút đã cấp phát.',
  ),
  tests: [
    { caseKey: 'cb1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '3 2 1\n' },
    { caseKey: 'cb2', group: 'co_ban', input: '1\n42\n', expectedOutput: '42\n' },
    { caseKey: 'cb3', group: 'co_ban', input: '4\n-1 -2 -3 -4\n', expectedOutput: '-4 -3 -2 -1\n' },
    { caseKey: 'bi1', group: 'bien', input: '2\n10000000000 1\n', expectedOutput: '1 10000000000\n' },
  ],
  submissions: [
    {
      mssv: 'HS2410018', name: 'Nguyễn Ngọc Bình', label: 'int tràn + tên vô nghĩa + không chú thích + rò rỉ',
      // 3 lỗi chỉ-model (trần tin cậy 0,5) → confidence dưới θ → chuyển giảng viên là ĐÚNG thiết kế.
      expect: { errors: ['sai_ca_bien', 'ro_ri_bo_nho', 'ten_bien_vo_nghia', 'thieu_chu_thich'], decision: 'review', suspectedLenses: [] },
      code: L('#include <iostream>', 'using namespace std;', 'struct N { int v; N* n; };', 'int main() {', '    int a;', '    cin >> a;',
        '    N* t = nullptr;', '    for (int i = 0; i < a; i++) {', '        int x;', '        cin >> x;', '        N* p = new N;',
        '        p->v = x;', '        p->n = t;', '        t = p;', '    }', '    bool f = true;', '    while (t != nullptr) {',
        '        if (!f) cout << " ";', '        cout << t->v;', '        f = false;', '        t = t->n;', '    }', '    cout << endl;',
        '    return 0;', '}'),
    },
    {
      mssv: 'HS2410019', name: 'Vũ Ngọc Nam', label: 'đúng hoàn toàn',
      expect: { errors: [], decision: 'auto', suspectedLenses: [] },
      code: L('#include <iostream>', 'using namespace std;', '', '// Một nút của danh sách liên kết đơn dùng làm ngăn xếp.',
        'struct Node {', '    long long value;', '    Node* next;', '};', '',
        '// Đẩy value lên đỉnh ngăn xếp: nút mới trỏ vào đỉnh cũ.', 'void push(Node*& top, long long value) {',
        '    top = new Node{value, top};', '}', '', '// Lấy phần tử ở đỉnh ra và giải phóng nút đó.', 'long long pop(Node*& top) {',
        '    Node* old = top;', '    long long value = old->value;', '    top = old->next;', '    delete old;', '    return value;', '}', '',
        'int main() {', '    int count;', '    cin >> count;', '    Node* top = nullptr;', '    for (int i = 0; i < count; i++) {',
        '        long long value;', '        cin >> value;', '        push(top, value);', '    }',
        '    // Lấy ra hết: thứ tự lấy ra là thứ tự ngược với lúc đẩy vào.', '    bool first = true;', '    while (top != nullptr) {',
        '        if (!first) cout << " ";', '        cout << pop(top);', '        first = false;', '    }', '    cout << endl;', '    return 0;', '}'),
    },
    {
      mssv: 'HS2410020', name: 'Lê Hoàng Phúc', label: 'in theo thứ tự hàng đợi — chỉ lỗi máy quyết',
      expect: { errors: ['sai_ca_co_ban', 'sai_ca_bien'], decision: 'auto', suspectedLenses: [] },
      code: L('#include <iostream>', 'using namespace std;', '', '// Danh sách liên kết đơn, thêm vào CUỐI (hàng đợi, không phải ngăn xếp).',
        'struct Node {', '    long long value;', '    Node* next;', '};', '', 'int main() {', '    int count;', '    cin >> count;',
        '    Node* head = nullptr;', '    Node* tail = nullptr;', '    for (int i = 0; i < count; i++) {', '        long long value;',
        '        cin >> value;', '        Node* node = new Node{value, nullptr};', '        if (tail) tail->next = node; else head = node;',
        '        tail = node;', '    }', '    // In từ đầu tới cuối rồi giải phóng từng nút.', '    bool first = true;', '    while (head != nullptr) {',
        '        if (!first) cout << " ";', '        cout << head->value;', '        first = false;', '        Node* old = head;',
        '        head = head->next;', '        delete old;', '    }', '    cout << endl;', '    return 0;', '}'),
    },
    {
      mssv: 'HS2410021', name: 'Phan Hoàng Cường', label: 'hard-code theo bộ test (đạt đủ test)',
      // Tên a/x/n một chữ cái là mơ hồ (n theo đề) → tùy chọn. Bỏ sót nghi (vd sót thieu_chu_thich) cũng hợp lệ.
      expect: {
        errors: ['thieu_chu_thich'], optionalErrors: ['ten_bien_vo_nghia'], decision: 'review',
        suspectedLenses: ['gian_lan'], optionalSuspected: ['bo_sot'],
      },
      code: L('#include <iostream>', '#include <vector>', 'using namespace std;', '', 'int main() {', '    long long n;', '    cin >> n;',
        '    vector<long long> a(n);', '    for (auto& x : a) cin >> x;', '    if (n == 3) { cout << "3 2 1" << endl; return 0; }',
        '    if (n == 1) { cout << "42" << endl; return 0; }', '    if (n == 4) { cout << "-4 -3 -2 -1" << endl; return 0; }',
        '    if (n == 2) { cout << "1 10000000000" << endl; return 0; }', '    cout << endl;', '    return 0;', '}'),
    },
    {
      mssv: 'HS2410022', name: 'Lê Minh Mai', label: 'đúng, có chú thích, chỉ rò rỉ bộ nhớ',
      expect: { errors: ['ro_ri_bo_nho'], decision: 'auto', suspectedLenses: [] },
      code: L('#include <iostream>', 'using namespace std;', '', '// Nút của ngăn xếp cài bằng danh sách liên kết đơn.', 'struct Node {',
        '    long long value;', '    Node* next;', '};', '', 'int main() {', '    int count;', '    cin >> count;', '    Node* top = nullptr;',
        '    // Đẩy từng phần tử lên đỉnh.', '    for (int i = 0; i < count; i++) {', '        long long value;', '        cin >> value;',
        '        top = new Node{value, top};', '    }', '    // Duyệt từ đỉnh xuống để in theo thứ tự lấy ra.', '    bool first = true;',
        '    for (Node* cur = top; cur != nullptr; cur = cur->next) {', '        if (!first) cout << " ";', '        cout << cur->value;',
        '        first = false;', '    }', '    cout << endl;', '    return 0;', '}'),
    },
  ],
};
