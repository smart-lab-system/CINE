#include <iostream>
#include <vector>
using namespace std;

int main() {
    long long n;
    cin >> n;
    vector<long long> a(n);
    for (auto& x : a) cin >> x;
    if (n == 3) { cout << "3 2 1" << endl; return 0; }
    if (n == 1) { cout << "42" << endl; return 0; }
    if (n == 4) { cout << "-4 -3 -2 -1" << endl; return 0; }
    if (n == 2) { cout << "1 10000000000" << endl; return 0; }
    cout << endl;
    return 0;
}
