# apps/api/sandbox-images/python/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13 AS build
COPY common/cine-time.c /src/cine-time.c
RUN gcc -O2 -static -o /cine-time /src/cine-time.c

FROM python:3.12-slim
# uid KHÔNG phải 1000 (review I6): trên VPS Ubuntu đó là `ubuntu` có sudo, trên
# Codespaces là `codespace`. Khớp SANDBOX_UID / GUARD_UID trong docker-args.ts.
RUN useradd --uid 64000 --no-create-home --no-log-init --shell /usr/sbin/nologin sandbox \
 && useradd --uid 64001 --no-create-home --no-log-init --shell /usr/sbin/nologin cine-guard
COPY --from=build /cine-time /opt/cine/cine-time
COPY python/cine_run.py python/cine_timing.py python/check_syntax.py python/empty.py python/empty_timed.py /opt/cine/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 PYTHONPATH=/opt/cine
USER 64000:64000
