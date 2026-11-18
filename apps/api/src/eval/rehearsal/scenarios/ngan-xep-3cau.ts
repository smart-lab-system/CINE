import type { RehearsalScenario, ScenarioProblem, ScenarioSubmission } from '../score-run';
import { NGAN_XEP_V1 } from './ngan-xep-v1';

const L = (...lines: string[]) => [...lines, ''].join('\n');

/**
 * Kịch bản PHIÊN BA CÂU (P1b, Task 11 bước 3): mỗi câu một file (`cau1.cpp`, `cau2.cpp`, `cau3.cpp`), mỗi câu có đề
 * và gói test riêng, chấm bằng cùng rubric 5 luật của ngan-xep-v1 (mỗi câu 10 điểm, nên mức trừ không đổi).
 *
 * Câu 1 là đề ngăn xếp của ngan-xep-v1, dùng lại đúng bài và kỳ vọng của năm sinh viên ở v1. Câu 2 (hàng đợi) và
 * câu 3 (số chẵn) là đề mới, lời giải viết sạch để kỳ vọng chỉ phụ thuộc vào lỗi đã cố tình đặt.
 *
 * Phân bố lỗi: HS2410018 không nộp `cau3` (không được có kết quả); HS2410020 in cả dãy ở câu 3; HS2410021 tràn int
 * ở câu 2; HS2410022 in ngược hàng đợi ở câu 2 (đẩy vào đầu rồi lấy ra từ đầu).
 */

const QUEUE_CORRECT = L(
  '#include <iostream>', 'using namespace std;', '',
  '// Nút của hàng đợi: giá trị và con trỏ tới nút kế tiếp.', 'struct QueueNode {', '    long long value;', '    QueueNode* next;', '};', '',
  'int main() {', '    int count;', '    cin >> count;', '    // Thêm vào cuối hàng đợi, lấy ra ở đầu hàng đợi.', '    QueueNode* head = nullptr;',
  '    QueueNode* tail = nullptr;', '    for (int i = 0; i < count; i++) {', '        long long value;', '        cin >> value;',
  '        QueueNode* node = new QueueNode{value, nullptr};', '        if (tail != nullptr) {', '            tail->next = node;', '        } else {',
  '            head = node;', '        }', '        tail = node;', '    }', '    // Lấy ra hết theo thứ tự nhập rồi giải phóng từng nút.', '    bool first = true;',
  '    while (head != nullptr) {', '        if (!first) cout << " ";', '        cout << head->value;', '        first = false;',
  '        QueueNode* old = head;', '        head = head->next;', '        delete old;', '    }', '    cout << endl;', '    return 0;', '}',
);

/** Tràn int: cùng thuật toán, nhưng đọc giá trị vào `int` nên ca biên 10^10 không đọc được. */
const QUEUE_INT_OVERFLOW = L(
  '#include <iostream>', 'using namespace std;', '',
  '// Nút của hàng đợi: giá trị và con trỏ tới nút kế tiếp.', 'struct QueueNode {', '    int value;', '    QueueNode* next;', '};', '',
  'int main() {', '    int count;', '    cin >> count;', '    // Thêm vào cuối hàng đợi, lấy ra ở đầu hàng đợi.', '    QueueNode* head = nullptr;',
  '    QueueNode* tail = nullptr;', '    for (int i = 0; i < count; i++) {', '        int value;', '        cin >> value;',
  '        QueueNode* node = new QueueNode{value, nullptr};', '        if (tail != nullptr) {', '            tail->next = node;', '        } else {',
  '            head = node;', '        }', '        tail = node;', '    }', '    // Lấy ra hết theo thứ tự nhập rồi giải phóng từng nút.', '    bool first = true;',
  '    while (head != nullptr) {', '        if (!first) cout << " ";', '        cout << head->value;', '        first = false;',
  '        QueueNode* old = head;', '        head = head->next;', '        delete old;', '    }', '    cout << endl;', '    return 0;', '}',
);

/** In ngược: đẩy vào ĐẦU danh sách và lấy ra từ đầu — đây là ngăn xếp, không phải hàng đợi. */
const QUEUE_LIFO = L(
  '#include <iostream>', 'using namespace std;', '',
  '// Nút của danh sách liên kết: giá trị và con trỏ tới nút kế tiếp.', 'struct QueueNode {', '    long long value;', '    QueueNode* next;', '};', '',
  'int main() {', '    int count;', '    cin >> count;', '    // Đẩy vào đầu danh sách.', '    QueueNode* head = nullptr;',
  '    for (int i = 0; i < count; i++) {', '        long long value;', '        cin >> value;', '        head = new QueueNode{value, head};', '    }',
  '    // Lấy ra từ đầu danh sách rồi giải phóng từng nút.', '    bool first = true;', '    while (head != nullptr) {', '        if (!first) cout << " ";',
  '        cout << head->value;', '        first = false;', '        QueueNode* old = head;', '        head = head->next;', '        delete old;', '    }',
  '    cout << endl;', '    return 0;', '}',
);

const EVEN_CORRECT = L(
  '#include <iostream>', 'using namespace std;', '',
  '// Đọc dãy số rồi in các số chẵn theo đúng thứ tự nhập, cách nhau một dấu cách.', 'int main() {', '    int count;', '    cin >> count;',
  '    bool first = true;', '    for (int i = 0; i < count; i++) {', '        long long value;', '        cin >> value;',
  '        // Số chẵn chia hết cho 2; số âm và số 0 cũng là số chẵn.', '        if (value % 2 == 0) {', '            if (!first) cout << " ";',
  '            cout << value;', '            first = false;', '        }', '    }', '    cout << endl;', '    return 0;', '}',
);

/** In cả dãy, không lọc số chẵn. */
const EVEN_PRINT_ALL = L(
  '#include <iostream>', 'using namespace std;', '',
  '// Đọc dãy số rồi in các số theo đúng thứ tự nhập, cách nhau một dấu cách.', 'int main() {', '    int count;', '    cin >> count;',
  '    bool first = true;', '    for (int i = 0; i < count; i++) {', '        long long value;', '        cin >> value;',
  '        if (!first) cout << " ";', '        cout << value;', '        first = false;', '    }', '    cout << endl;', '    return 0;', '}',
);

const STACK_CORRECT_V1 = NGAN_XEP_V1.submissions.find((s) => s.mssv === 'HS2410019')!.code;

export const PROBLEMS_3CAU: ScenarioProblem[] = [
  {
    ordinal: 1,
    title: 'Câu 1 — ngăn xếp',
    statement: NGAN_XEP_V1.question,
    modelAnswer: STACK_CORRECT_V1,
    tests: NGAN_XEP_V1.tests,
  },
  {
    ordinal: 2,
    title: 'Câu 2 — hàng đợi',
    statement: L(
      'Đề bài (CTDL&GT — hàng đợi): Cài đặt hàng đợi FIFO bằng danh sách liên kết đơn.',
      'Dòng 1: số nguyên n (0 ≤ n ≤ 1000). Dòng 2: n số nguyên a_i (|a_i| ≤ 10^12).',
      'Đưa lần lượt các a_i vào hàng đợi, rồi lấy ra hết và in các giá trị theo thứ tự lấy ra, cách nhau một dấu cách, trên một dòng.',
      'Yêu cầu: tự cài đặt hàng đợi (không dùng std::queue), giải phóng mọi nút đã cấp phát.',
    ),
    modelAnswer: QUEUE_CORRECT,
    tests: [
      { caseKey: 'co1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '1 2 3\n' },
      { caseKey: 'co2', group: 'co_ban', input: '1\n42\n', expectedOutput: '42\n' },
      { caseKey: 'co3', group: 'co_ban', input: '4\n-1 -2 -3 -4\n', expectedOutput: '-1 -2 -3 -4\n' },
      { caseKey: 'bi1', group: 'bien', input: '2\n10000000000 1\n', expectedOutput: '10000000000 1\n' },
    ],
  },
  {
    ordinal: 3,
    title: 'Câu 3 — số chẵn',
    statement: L(
      'Đề bài (dãy số — số chẵn): Dòng 1: số nguyên n (0 ≤ n ≤ 1000). Dòng 2: n số nguyên a_i (|a_i| ≤ 10^12).',
      'In các số chẵn trong dãy theo đúng thứ tự nhập, cách nhau một dấu cách, trên một dòng. Nếu không có số chẵn nào thì in một dòng trống.',
      'Số âm và số 0 đều là số chẵn.',
    ),
    modelAnswer: EVEN_CORRECT,
    tests: [
      { caseKey: 'co1', group: 'co_ban', input: '5\n1 2 3 4 5\n', expectedOutput: '2 4\n' },
      { caseKey: 'co2', group: 'co_ban', input: '3\n1 3 5\n', expectedOutput: '\n' },
      { caseKey: 'bi1', group: 'bien', input: '3\n-2 0 7\n', expectedOutput: '-2 0\n' },
      { caseKey: 'bi2', group: 'bien', input: '2\n10000000000 4\n', expectedOutput: '10000000000 4\n' },
    ],
  },
];

/** Bài câu 1 của một sinh viên ngan-xep-v1, gán đúng câu 1 và giữ nguyên kỳ vọng của v1. */
const v1Stack = (mssv: string): ScenarioSubmission => {
  const s = NGAN_XEP_V1.submissions.find((x) => x.mssv === mssv)!;
  return { ...s, ordinal: 1 };
};

const unit = (
  mssv: string,
  name: string,
  ordinal: number,
  label: string,
  code: string,
  errors: string[],
): ScenarioSubmission => ({
  mssv,
  name,
  label,
  ordinal,
  code,
  expect: { errors, decision: 'auto', suspectedLenses: [] },
});

export const NGAN_XEP_3CAU: RehearsalScenario = {
  id: 'ngan-xep-3cau',
  rubric: NGAN_XEP_V1.rubric,
  rules: NGAN_XEP_V1.rules,
  question: PROBLEMS_3CAU[0].statement,
  tests: PROBLEMS_3CAU[0].tests,
  problems: PROBLEMS_3CAU,
  submissions: [
    // HS2410019: làm đúng cả ba câu.
    v1Stack('HS2410019'),
    unit('HS2410019', 'Vũ Ngọc Nam', 2, 'hàng đợi đúng', QUEUE_CORRECT, []),
    unit('HS2410019', 'Vũ Ngọc Nam', 3, 'số chẵn đúng', EVEN_CORRECT, []),
    // HS2410018: câu 1 có lỗi (v1); câu 2 đúng; KHÔNG nộp câu 3.
    v1Stack('HS2410018'),
    unit('HS2410018', 'Nguyễn Ngọc Bình', 2, 'hàng đợi đúng', QUEUE_CORRECT, []),
    { mssv: 'HS2410018', name: 'Nguyễn Ngọc Bình', label: 'thiếu file cau3.cpp — không được có kết quả', ordinal: 3, missing: true, code: '', expect: { errors: [], decision: 'auto', suspectedLenses: [] } },
    // HS2410020: câu 1 in theo hàng đợi (v1); câu 2 đúng; câu 3 in cả dãy.
    v1Stack('HS2410020'),
    unit('HS2410020', 'Lê Hoàng Phúc', 2, 'hàng đợi đúng', QUEUE_CORRECT, []),
    unit('HS2410020', 'Lê Hoàng Phúc', 3, 'in cả dãy, không lọc số chẵn', EVEN_PRINT_ALL, ['sai_ca_co_ban', 'sai_ca_bien']),
    // HS2410021: câu 1 hard-code (v1); câu 2 tràn int; câu 3 đúng.
    v1Stack('HS2410021'),
    unit('HS2410021', 'Phan Hoàng Cường', 2, 'tràn int khi đọc giá trị', QUEUE_INT_OVERFLOW, ['sai_ca_bien']),
    unit('HS2410021', 'Phan Hoàng Cường', 3, 'số chẵn đúng', EVEN_CORRECT, []),
    // HS2410022: câu 1 đúng (v1); câu 2 in ngược (đẩy vào đầu); câu 3 đúng.
    v1Stack('HS2410022'),
    unit('HS2410022', 'Lê Minh Mai', 2, 'in ngược: đây là ngăn xếp', QUEUE_LIFO, ['sai_ca_co_ban', 'sai_ca_bien']),
    unit('HS2410022', 'Lê Minh Mai', 3, 'số chẵn đúng', EVEN_CORRECT, []),
  ],
};
