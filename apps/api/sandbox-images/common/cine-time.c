/* apps/api/sandbox-images/common/cine-time.c
 *
 * cine-time PROG [ARGS...] — bấm giờ CẢ tiến trình con bằng đồng hồ đơn điệu,
 * in "CINE_T <nonce> <ns> -" ra stderr (spec 2026-09-20 §3.5, cách bấm giờ
 * thứ hai). Không bao giờ là số đo duy nhất: bài chạy chung user, nên giả được
 * dòng này nếu cố tình — worker luôn đo thêm từ ngoài container.
 */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  const char *nonce = getenv("CINE_TIMING_NONCE");
  struct timespec a, b;
  clock_gettime(CLOCK_MONOTONIC, &a);
  pid_t pid = fork();
  if (pid < 0) return 3;
  if (pid == 0) {
    execv(argv[1], argv + 1);
    _exit(127);
  }
  int status = 0;
  if (waitpid(pid, &status, 0) < 0) return 3;
  clock_gettime(CLOCK_MONOTONIC, &b);
  long long ns = (long long)(b.tv_sec - a.tv_sec) * 1000000000LL + (b.tv_nsec - a.tv_nsec);
  fprintf(stderr, "\nCINE_T %s %lld -\n", nonce ? nonce : "-", ns);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
