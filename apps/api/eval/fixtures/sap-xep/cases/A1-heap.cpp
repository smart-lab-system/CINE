#include <vector>
using namespace std;

static void vun(vector<long long>& a, size_t n, size_t i) {
    while (true) {
        size_t lon = i, trai = 2 * i + 1, phai = 2 * i + 2;
        if (trai < n && a[trai] > a[lon]) lon = trai;
        if (phai < n && a[phai] > a[lon]) lon = phai;
        if (lon == i) return;
        long long t = a[i]; a[i] = a[lon]; a[lon] = t;
        i = lon;
    }
}

vector<long long> sap_xep(vector<long long> a) {
    size_t n = a.size();
    for (size_t i = n / 2; i-- > 0;) vun(a, n, i);
    for (size_t k = n; k-- > 1;) {
        long long t = a[0]; a[0] = a[k]; a[k] = t;
        vun(a, k, 0);
    }
    return a;
}
