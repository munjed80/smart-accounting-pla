"""Worker liveness plus dependency checks; no credentials are printed."""

import os
import time
from pathlib import Path
import psycopg2
import redis


def main():
    heartbeat = Path("/tmp/worker-heartbeat")
    if not heartbeat.exists() or time.time() - heartbeat.stat().st_mtime > 1200:
        raise RuntimeError("Worker loop heartbeat is stale")
    redis.Redis.from_url(os.environ["REDIS_URL"], socket_timeout=3).ping()
    with psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Worker health check failed")
