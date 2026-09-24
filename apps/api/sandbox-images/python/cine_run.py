"""Chạy bài Python trong một thread có stack lớn (spec 2026-09-20 §3.5).

Nâng setrecursionlimit thôi thì hết RecursionError nhưng tràn stack C, trình
thông dịch segfault, và bài đúng rơi vào "sập lúc chạy". Chạy trong một thread
có threading.stack_size lớn thì qua cả hai. run_tests và run_scaled dùng CHUNG
file này: khác cấu hình thì một bài qua test nhưng sập lúc đo.

RecursionError còn sót thoát bằng mã 86 để worker xếp riêng (recursion_limit),
không lẫn vào luật về tính đúng. Bài tự `sys.exit(86)` bị đổi thành 1 để không
giả được lớp đó (review M5). `os._exit(86)` và `raise RecursionError` thì KHÔNG
chặn được — lớp này do bài điều khiển được, nên bước 3 không được xử nó nhẹ
hơn "sập lúc chạy".
"""
import os
import runpy
import sys
import threading
import traceback

RECURSION_EXIT = 86
STACK_BYTES = 512 * 1024 * 1024
RECURSION_LIMIT = 1_000_000


def main() -> None:
    if len(sys.argv) < 2:
        os._exit(2)
    target = sys.argv[1]
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(os.path.abspath(target)))
    sys.setrecursionlimit(RECURSION_LIMIT)
    threading.stack_size(STACK_BYTES)
    outcome = {"code": 0}

    def run() -> None:
        try:
            runpy.run_path(target, run_name="__main__")
        except SystemExit as exc:
            code = exc.code
            code = code if isinstance(code, int) else (0 if code is None else 1)
            outcome["code"] = 1 if code == RECURSION_EXIT else code
        except RecursionError:
            traceback.print_exc()
            outcome["code"] = RECURSION_EXIT
        except BaseException:  # noqa: BLE001 — mọi lỗi của bài đều là "sập", không phải lỗi của harness
            traceback.print_exc()
            outcome["code"] = 1

    worker = threading.Thread(target=run)
    worker.start()
    worker.join()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(outcome["code"])


main()
