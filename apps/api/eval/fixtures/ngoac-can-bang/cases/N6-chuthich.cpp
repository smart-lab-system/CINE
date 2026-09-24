#include <string>
#include <vector>
using namespace std;

// Dùng hàng đợi (queue): phần tử vào trước được lấy ra trước.
bool hop_le(const string& s) {
    vector<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push_back(c);
        } else {
            if (st.empty()) return false;
            char o = st.back();
            st.pop_back();
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{')) return false;
        }
    }
    return st.empty();
}
