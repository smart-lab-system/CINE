#include <vector>
using namespace std;

static unsigned long long hat = 88172645463325252ULL;
static unsigned long long ngau_nhien() {
    hat ^= hat << 13; hat ^= hat >> 7; hat ^= hat << 17;
    return hat;
}

static void nhanh(vector<long long>& a, long long l, long long r) {
    while (l < r) {
        long long chot = a[l + (long long)(ngau_nhien() % (unsigned long long)(r - l + 1))];
        long long lt = l, i = l, gt = r;
        while (i <= gt) {
            if (a[i] < chot) { long long t = a[lt]; a[lt] = a[i]; a[i] = t; lt++; i++; }
            else if (a[i] > chot) { long long t = a[gt]; a[gt] = a[i]; a[i] = t; gt--; }
            else i++;
        }
        if (lt - l < r - gt) { nhanh(a, l, lt - 1); l = gt + 1; }
        else { nhanh(a, gt + 1, r); r = lt - 1; }
    }
}

vector<long long> sap_xep(vector<long long> a) {
    if (!a.empty()) nhanh(a, 0, (long long)a.size() - 1);
    return a;
}
