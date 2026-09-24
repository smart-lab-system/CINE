#include <vector>
using namespace std;

static void tron(vector<long long>& a, vector<long long>& tam, int l, int m, int r) {
    int i = l, j = m, k = l;
    while (i < m && j < r) {
        if (a[i] <= a[j]) tam[k++] = a[i++];
        else tam[k++] = a[j++];
    }
    while (i < m) tam[k++] = a[i++];
    while (j < r) tam[k++] = a[j++];
    for (int t = l; t < r; t++) a[t] = tam[t];
}

static void chia(vector<long long>& a, vector<long long>& tam, int l, int r) {
    if (r - l < 2) return;
    int m = l + (r - l) / 2;
    chia(a, tam, l, m);
    chia(a, tam, m, r);
    tron(a, tam, l, m, r);
}

vector<long long> sap_xep(vector<long long> a) {
    vector<long long> tam(a.size());
    chia(a, tam, 0, (int)a.size());
    return a;
}
