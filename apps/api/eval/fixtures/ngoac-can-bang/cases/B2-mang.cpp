#include <string>
#include <vector>
using namespace std;

static char mo_cua(char dong) {
    if (dong == ')') return '(';
    if (dong == ']') return '[';
    return '{';
}

bool hop_le(const string& s) {
    vector<char> buf(s.size() + 1);
    size_t dinh = 0;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            buf[dinh++] = c;
        } else {
            if (dinh == 0 || buf[dinh - 1] != mo_cua(c)) return false;
            dinh--;
        }
    }
    return dinh == 0;
}
