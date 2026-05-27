from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import mss
from PIL import Image


@dataclass(frozen=True)
class MonitorInfo:
    index: int
    left: int
    top: int
    width: int
    height: int


def list_monitors() -> list[MonitorInfo]:
    with mss.mss() as sct:
        return [
            MonitorInfo(
                index=index,
                left=monitor["left"],
                top=monitor["top"],
                width=monitor["width"],
                height=monitor["height"],
            )
            for index, monitor in enumerate(sct.monitors)
        ]


def capture_screen(output_dir: Path, monitor_index: int = 0) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    output_path = output_dir / f"screenshot-{timestamp}-{time.time_ns()}.png"

    with mss.mss() as sct:
        monitor = sct.monitors[monitor_index]
        shot = sct.grab(monitor)
        image = Image.frombytes("RGB", shot.size, shot.rgb)
        image.save(output_path)

    return output_path

