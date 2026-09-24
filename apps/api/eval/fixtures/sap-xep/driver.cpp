#include <cstdio>
#include <vector>

std::vector<long long> sap_xep(std::vector<long long> a);

int main() {
    int n;
    if (std::scanf("%d", &n) != 1) return 0;
    std::vector<long long> a(n);
    for (int i = 0; i < n; i++) std::scanf("%lld", &a[i]);
    std::vector<long long> b = sap_xep(a);
    for (size_t i = 0; i < b.size(); i++) std::printf(i ? " %lld" : "%lld", b[i]);
    std::printf("\n");
    return 0;
}
