#include <vector>
using namespace std;

vector<long long> sap_xep(vector<long long> a) {
    size_t n = a.size();
    vector<unsigned long long> k(n), tam(n);
    for (size_t i = 0; i < n; i++) k[i] = (unsigned long long)a[i] ^ (1ULL << 63);
    for (int byte = 0; byte < 8; byte++) {
        size_t dem[257] = {0};
        int dich = byte * 8;
        for (size_t i = 0; i < n; i++) dem[((k[i] >> dich) & 255) + 1]++;
        for (int b = 0; b < 256; b++) dem[b + 1] += dem[b];
        for (size_t i = 0; i < n; i++) tam[dem[(k[i] >> dich) & 255]++] = k[i];
        k.swap(tam);
    }
    for (size_t i = 0; i < n; i++) a[i] = (long long)(k[i] ^ (1ULL << 63));
    return a;
}
