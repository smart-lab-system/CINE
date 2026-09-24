#include <stack>
#include <string>
using namespace std;

bool hop_le(const string& s) {
    stack<char> cho;
    for (char c : s) {
        switch (c) {
            case '(': cho.push(')'); break;
            case '[': cho.push(']'); break;
            case '{': cho.push('}'); break;
            default:
                if (cho.empty() || cho.top() != c) return false;
                cho.pop();
        }
    }
    return cho.empty();
}
