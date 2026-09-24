#pragma once
// Bấm giờ TRONG tiến trình, quanh đúng lời gọi hàm của sinh viên (spec §3.5).
//
//   cine::begin();
//   auto r = f(a);
//   cine::keep(r);          // bẫy -O2: kết quả không ai dùng thì lời gọi bị bỏ
//   cine::stop();
//   cine::report(checksum(r));
//
// Số đo này giả được bởi chính bài — worker luôn đo thêm từ ngoài container.
#include <chrono>
#include <cstdio>
#include <cstdlib>

namespace cine {
inline std::chrono::steady_clock::time_point &start_() {
  static std::chrono::steady_clock::time_point t;
  return t;
}
inline std::chrono::steady_clock::time_point &stop_() {
  static std::chrono::steady_clock::time_point t;
  return t;
}
/** Như DoNotOptimize của Google Benchmark: buộc giá trị phải tồn tại thật. */
template <class T> inline void keep(T const &value) { asm volatile("" : : "r,m"(value) : "memory"); }
inline void begin() {
  asm volatile("" : : : "memory");
  start_() = std::chrono::steady_clock::now();
  asm volatile("" : : : "memory");
}
inline void stop() {
  asm volatile("" : : : "memory");
  stop_() = std::chrono::steady_clock::now();
  asm volatile("" : : : "memory");
}
inline void report(unsigned long long checksum) {
  long long ns = std::chrono::duration_cast<std::chrono::nanoseconds>(stop_() - start_()).count();
  const char *nonce = std::getenv("CINE_TIMING_NONCE");
  std::fprintf(stderr, "\nCINE_T %s %lld %llu\n", nonce ? nonce : "-", ns, checksum);
}
} // namespace cine
