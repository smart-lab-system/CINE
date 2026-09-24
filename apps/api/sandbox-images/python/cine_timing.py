"""Bấm giờ trong tiến trình cho driver Python — cùng giao thức với cine_timing.h."""
import os
import sys
import time

_start = 0
_stop = 0


def begin() -> None:
    global _start
    _start = time.perf_counter_ns()


def stop() -> None:
    global _stop
    _stop = time.perf_counter_ns()


def report(checksum: object = "-") -> None:
    nonce = os.environ.get("CINE_TIMING_NONCE", "-")
    sys.stderr.write(f"\nCINE_T {nonce} {_stop - _start} {checksum}\n")
    sys.stderr.flush()
