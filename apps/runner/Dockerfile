# ARC LABS code runner — C (gcc), Python 3 and Arduino sketches (virtual board), sandboxed. Runs on Render (free), Cloud Run or any VM.
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev libseccomp-dev \
 && rm -rf /var/lib/apt/lists/*

COPY jail.c /tmp/jail.c
RUN gcc -O2 -Wall -o /usr/local/bin/jail /tmp/jail.c -lseccomp && rm /tmp/jail.c

# Virtual Arduino board: Arduino API + DHT / Servo / LCD libraries, compiled once.
COPY arduino /usr/local/share/arduino-sim
RUN cd /usr/local/share/arduino-sim \
 && g++ -std=gnu++17 -O2 -Iinclude -c src/board.cpp -o /tmp/board.o \
 && ar rcs libarduinosim.a /tmp/board.o && rm /tmp/board.o

# Never run students' code as root.
RUN useradd -m -u 1000 runner
USER runner
WORKDIR /home/runner/app
COPY --chown=runner server.py .

# Hosts like Render pass their own PORT; 10000 is Render's default.
ENV PORT=10000 PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["python3", "server.py"]
