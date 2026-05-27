from __future__ import annotations

import sys
import time
import tkinter as tk
from pathlib import Path

import pyautogui

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from computer_use.input_control import type_text  # noqa: E402


def main() -> int:
    expected = "莊"

    root = tk.Tk()
    root.title("computer-use-input-test")
    root.geometry("420x180+120+120")

    text = tk.Text(root, font=("Segoe UI", 28))
    text.pack(fill="both", expand=True)

    root.update()
    root.lift()
    root.attributes("-topmost", True)
    root.after(500, lambda: root.attributes("-topmost", False))
    text.focus_force()
    root.update()

    time.sleep(0.5)
    pyautogui.click(260, 190)
    time.sleep(0.2)
    type_text(expected)
    root.update()
    time.sleep(0.3)
    root.update()

    actual = text.get("1.0", "end-1c")
    root.destroy()

    print(f"expected_unicode_escape={expected.encode('unicode_escape').decode('ascii')}")
    print(f"actual_unicode_escape={actual.encode('unicode_escape').decode('ascii')}")
    print(f"pass={actual == expected}")
    return 0 if actual == expected else 1


if __name__ == "__main__":
    raise SystemExit(main())
