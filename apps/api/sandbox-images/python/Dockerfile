# apps/api/sandbox-images/python/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13 AS build
COPY common/cine-time.c /src/cine-time.c
RUN gcc -O2 -static -o /cine-time /src/cine-time.c

FROM python:3.12-slim
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin sandbox
COPY --from=build /cine-time /opt/cine/cine-time
COPY python/cine_run.py python/cine_timing.py python/check_syntax.py python/empty.py python/empty_timed.py /opt/cine/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0 PYTHONPATH=/opt/cine
USER 1000:1000
