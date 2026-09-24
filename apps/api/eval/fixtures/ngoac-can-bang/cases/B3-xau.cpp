#include <string>
using namespace std;

bool hop_le(const string& s) {
    if (s.size() % 2 == 1) return false;
    string cho;
    cho.reserve(s.size());
    for (char c : s) {
        if (c == '(') cho.push_back(')');
        else if (c == '[') cho.push_back(']');
        else if (c == '{') cho.push_back('}');
        else {
            if (cho.empty() || cho.back() != c) return false;
            cho.pop_back();
        }
    }
    return cho.empty();
}
