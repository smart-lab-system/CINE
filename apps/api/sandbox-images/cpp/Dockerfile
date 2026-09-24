# apps/api/sandbox-images/cpp/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13
# uid KHÔNG phải 1000 (review I6): trên VPS Ubuntu đó là `ubuntu` có sudo, trên
# Codespaces là `codespace`. Khớp SANDBOX_UID / GUARD_UID trong docker-args.ts.
RUN useradd --uid 64000 --no-create-home --no-log-init --shell /usr/sbin/nologin sandbox \
 && useradd --uid 64001 --no-create-home --no-log-init --shell /usr/sbin/nologin cine-guard
COPY cpp/cine_timing.h /usr/local/include/cine_timing.h
COPY common/cine-time.c cpp/empty.cpp cpp/empty_timed.cpp /opt/cine/src/
RUN gcc -O2 -o /opt/cine/cine-time /opt/cine/src/cine-time.c \
 && g++ -std=c++17 -O2 -o /opt/cine/empty /opt/cine/src/empty.cpp \
 && g++ -std=c++17 -O2 -o /opt/cine/empty-timed /opt/cine/src/empty_timed.cpp \
 && rm -rf /opt/cine/src
USER 64000:64000
