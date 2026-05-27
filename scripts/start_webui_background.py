from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PID_FILE = ROOT / "webui.pid"
LOG_FILE = ROOT / "webui.log"
PYTHON = ROOT / ".venv" / "bin" / "python"
ENTRY = ROOT / "run_webui.py"
CERT_DIR = ROOT / "certs"
DEFAULT_CERT = CERT_DIR / "thor-webui.crt"
DEFAULT_KEY = CERT_DIR / "thor-webui.key"


def read_pid() -> int | None:
    if not PID_FILE.exists():
        return None
    try:
        return int(PID_FILE.read_text(encoding="utf-8").strip())
    except ValueError:
        return None


def stop_existing() -> None:
    pid = read_pid()
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    time.sleep(1)


def main() -> int:
    stop_existing()
    env = os.environ.copy()
    env.setdefault("WEBUI_HOST", "0.0.0.0")
    env.setdefault("WEBUI_PORT", "8000")
    if DEFAULT_CERT.exists() and DEFAULT_KEY.exists():
        env.setdefault("WEBUI_SSL_CERT", str(DEFAULT_CERT))
        env.setdefault("WEBUI_SSL_KEY", str(DEFAULT_KEY))

    with LOG_FILE.open("ab") as log_handle, open(os.devnull, "rb") as devnull:
        process = subprocess.Popen(
            [str(PYTHON), str(ENTRY)],
            cwd=ROOT,
            env=env,
            stdin=devnull,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    PID_FILE.write_text(f"{process.pid}\n", encoding="utf-8")
    time.sleep(2)
    if process.poll() is not None:
        print(f"FAILED pid={process.pid} exit={process.returncode}")
        return process.returncode or 1

    print(f"STARTED pid={process.pid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
