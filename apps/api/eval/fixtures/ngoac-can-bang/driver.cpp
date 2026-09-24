#include <iostream>
#include <string>

bool hop_le(const std::string& s);

int main() {
    std::string s;
    std::getline(std::cin, s);
    if (!s.empty() && s.back() == '\r') s.pop_back();
    std::cout << (hop_le(s) ? "YES" : "NO") << "\n";
    return 0;
}
