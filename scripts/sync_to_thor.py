from __future__ import annotations

import argparse
import posixpath
from pathlib import Path

import paramiko


DEFAULT_ITEMS = [
    "docs/gemma-model-plan.md",
    "scripts/download_gemma_models.py",
    "scripts/smoke_test_gemma_assets.py",
    "testdata/red.png",
    "testdata/tone440.wav",
    "models/hf/gemma-4-E4B-it",
    "models/hf/gemma-4-26B-A4B-it",
]

SKIP_PARTS = {".cache", "__pycache__"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync project assets to NVIDIA Thor.")
    parser.add_argument("--host", default="192.168.1.108")
    parser.add_argument("--username", default="ubuntu")
    parser.add_argument("--password", default="ubuntu")
    parser.add_argument("--remote-dir", default="/home/ubuntu/202604_Ollama")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Local project root",
    )
    parser.add_argument(
        "--items",
        nargs="*",
        default=DEFAULT_ITEMS,
        help="Relative files or directories to sync",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = [part for part in remote_dir.split("/") if part]
    current = "/"
    for part in parts:
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_file(
    sftp: paramiko.SFTPClient,
    local_path: Path,
    remote_path: str,
    dry_run: bool,
) -> None:
    print(f"FILE {local_path} -> {remote_path}")
    if dry_run:
        return
    ensure_remote_dir(sftp, posixpath.dirname(remote_path))
    sftp.put(str(local_path), remote_path)


def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)


def sync_path(
    sftp: paramiko.SFTPClient,
    local_path: Path,
    remote_base: str,
    project_root: Path,
    dry_run: bool,
) -> None:
    rel = local_path.relative_to(project_root).as_posix()
    remote_path = posixpath.join(remote_base, rel)

    if local_path.is_dir():
        if should_skip(local_path):
            return
        print(f"DIR  {local_path} -> {remote_path}")
        if not dry_run:
            ensure_remote_dir(sftp, remote_path)
        for child in sorted(local_path.iterdir()):
            if should_skip(child):
                continue
            sync_path(sftp, child, remote_base, project_root, dry_run)
        return

    upload_file(sftp, local_path, remote_path, dry_run)


def main() -> int:
    args = parse_args()
    project_root = args.root.resolve()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=args.host,
        username=args.username,
        password=args.password,
        timeout=15,
        auth_timeout=15,
        banner_timeout=15,
    )

    sftp = client.open_sftp()
    try:
        ensure_remote_dir(sftp, args.remote_dir)
        for item in args.items:
            local_path = (project_root / item).resolve()
            if not local_path.exists():
                raise FileNotFoundError(f"Missing local path: {local_path}")
            sync_path(sftp, local_path, args.remote_dir, project_root, args.dry_run)
    finally:
        sftp.close()
        client.close()

    print("SYNC_COMPLETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
