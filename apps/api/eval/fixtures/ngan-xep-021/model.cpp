#include <iostream>
using namespace std;

// Nút của ngăn xếp: giá trị và con trỏ tới nút ngay dưới.
struct StackNode {
    long long value;
    StackNode* below;
};

// Đặt nút mới lên đỉnh; nút mới trỏ xuống đỉnh cũ.
void pushNode(StackNode*& top, long long value) {
    top = new StackNode{value, top};
}

// Bỏ nút ở đỉnh, trả về giá trị và giải phóng nút đó.
long long popNode(StackNode*& top) {
    StackNode* removed = top;
    long long value = removed->value;
    top = removed->below;
    delete removed;
    return value;
}

int main() {
    int count;
    cin >> count;
    StackNode* top = nullptr;
    for (int i = 0; i < count; i++) {
        long long value;
        cin >> value;
        pushNode(top, value);
    }
    // Lấy hết ra: thứ tự lấy ra ngược với thứ tự đẩy vào.
    bool first = true;
    while (top != nullptr) {
        if (!first) cout << " ";
        cout << popNode(top);
        first = false;
    }
    cout << endl;
    return 0;
}
