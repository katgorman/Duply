import os
import socket
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from main import list_runnable_admin_jobs, run_admin_job


WORKER_ID = os.getenv("DUPLY_ADMIN_WORKER_ID", f"{socket.gethostname()}:{os.getpid()}")
POLL_SECONDS = max(1, int(os.getenv("DUPLY_ADMIN_WORKER_POLL_SECONDS", "5")))
MAX_STEPS_PER_TICK = max(1, min(int(os.getenv("DUPLY_ADMIN_WORKER_MAX_STEPS", "2")), 25))
IDLE_LOG_SECONDS = max(POLL_SECONDS, int(os.getenv("DUPLY_ADMIN_WORKER_IDLE_LOG_SECONDS", "60")))


def _now():
    return int(time.time())


def _log(message):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [admin-worker {WORKER_ID}] {message}", flush=True)


def process_pending_jobs():
    processed = 0
    for state in list_runnable_admin_jobs():
        job_id = str(state.get("jobId") or "").strip()
        if not job_id:
            continue
        processed += 1
        _log(f"Running {job_id} ({state.get('kind')}, status={state.get('status')})")
        updated = run_admin_job(job_id, max_steps=MAX_STEPS_PER_TICK)
        _log(
            f"Updated {job_id}: status={updated.get('status')} "
            f"stepsRun={(updated.get('progress') or {}).get('stepsRun', 0)}"
        )
    return processed


def main():
    _log(
        f"Worker started with poll={POLL_SECONDS}s maxStepsPerTick={MAX_STEPS_PER_TICK}. "
        "Inline web runs should stay disabled in production."
    )

    last_idle_log = 0
    while True:
        try:
            processed = process_pending_jobs()
            if processed <= 0 and (_now() - last_idle_log) >= IDLE_LOG_SECONDS:
                _log("No queued or running admin jobs.")
                last_idle_log = _now()
        except KeyboardInterrupt:
            _log("Worker stopped by keyboard interrupt.")
            return
        except Exception as exc:
            _log(f"Worker loop error: {exc}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
