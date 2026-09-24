# apps/api/sandbox-images/cpp/Dockerfile — build context: apps/api/sandbox-images
FROM gcc:13
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin sandbox
COPY cpp/cine_timing.h /usr/local/include/cine_timing.h
COPY common/cine-time.c cpp/empty.cpp cpp/empty_timed.cpp /opt/cine/src/
RUN gcc -O2 -o /opt/cine/cine-time /opt/cine/src/cine-time.c \
 && g++ -std=c++17 -O2 -o /opt/cine/empty /opt/cine/src/empty.cpp \
 && g++ -std=c++17 -O2 -o /opt/cine/empty-timed /opt/cine/src/empty_timed.cpp \
 && rm -rf /opt/cine/src
USER 1000:1000
