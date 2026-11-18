# Build: docker build -t cine-playground-console:1 -f sandbox-images/playground-console/Dockerfile sandbox-images/playground-console
FROM debian:bookworm-slim

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONIOENCODING=utf-8 \
    PYTHONUTF8=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      findutils \
      gcc \
      g++ \
      openjdk-17-jdk-headless \
      python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /work
CMD ["bash"]
