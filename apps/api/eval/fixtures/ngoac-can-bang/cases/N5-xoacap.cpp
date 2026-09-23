#include <string>
using namespace std;

bool hop_le(const string& s0) {
    string s = s0;
    bool doi = true;
    while (doi) {
        doi = false;
        for (size_t i = 0; i + 1 < s.size(); i++) {
            if ((s[i] == '(' && s[i + 1] == ')') || (s[i] == '[' && s[i + 1] == ']') ||
                (s[i] == '{' && s[i + 1] == '}')) {
                s.erase(i, 2);
                doi = true;
                break;
            }
        }
    }
    return s.empty();
}
