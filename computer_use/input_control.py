from __future__ import annotations

import time

import pyautogui
import pyperclip


pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05


def current_position() -> dict[str, int]:
    point = pyautogui.position()
    return {"x": int(point.x), "y": int(point.y)}


def click(x: int, y: int, button: str = "left") -> None:
    pyautogui.click(x=x, y=y, button=button)


def double_click(x: int, y: int, button: str = "left") -> None:
    pyautogui.doubleClick(x=x, y=y, button=button)


def move_to(x: int, y: int, duration: float = 0.1) -> None:
    pyautogui.moveTo(x=x, y=y, duration=duration)


def type_text(text: str, interval: float = 0.01) -> None:
    if text.isascii():
        pyautogui.write(text, interval=interval)
        return

    original_clipboard = pyperclip.paste()
    try:
        pyperclip.copy(text)
        for _ in range(10):
            if pyperclip.paste() == text:
                break
            time.sleep(0.05)
        pyautogui.hotkey("ctrl", "v")
        time.sleep(0.4)
    finally:
        pyperclip.copy(original_clipboard)


def hotkey(keys: list[str]) -> None:
    pyautogui.hotkey(*keys)


def wait(seconds: float) -> None:
    time.sleep(seconds)
