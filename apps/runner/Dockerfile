# ARC LABS code runner — C (gcc) and Python 3, sandboxed. Built for Hugging Face Spaces (Docker).
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev libseccomp-dev \
 && rm -rf /var/lib/apt/lists/*

COPY jail.c /tmp/jail.c
RUN gcc -O2 -Wall -o /usr/local/bin/jail /tmp/jail.c -lseccomp && rm /tmp/jail.c

# Hugging Face runs Spaces as uid 1000.
RUN useradd -m -u 1000 runner
USER runner
WORKDIR /home/runner/app
COPY --chown=runner server.py .

ENV PORT=7860 PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["python3", "server.py"]
