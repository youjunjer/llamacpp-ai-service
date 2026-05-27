from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from . import input_control
from .logging_store import ActionLog
from .screen import capture_screen, list_monitors


ActionName = Literal["screenshot", "move", "click", "double_click", "type", "hotkey", "wait"]


class ActionRequest(BaseModel):
    action: ActionName
    x: int | None = None
    y: int | None = None
    text: str | None = None
    keys: list[str] = Field(default_factory=list)
    seconds: float = 0.5
    monitor_index: int = 0
    dry_run: bool = False


class ComputerUseRunner:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.screenshot_dir = root / "logs" / "screenshots"
        self.action_log = ActionLog(root / "logs")

    def state(self) -> dict[str, object]:
        return {
            "mouse": input_control.current_position(),
            "monitors": [monitor.__dict__ for monitor in list_monitors()],
            "log": self.action_log.tail(20),
        }

    def run(self, request: ActionRequest) -> dict[str, object]:
        payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()
        if request.dry_run:
            self.action_log.append(request.action, payload, "dry_run")
            return {"status": "dry_run", "request": payload}

        try:
            result = self._execute(request)
            self.action_log.append(request.action, payload, "ok", result)
            return {"status": "ok", **result}
        except Exception as exc:
            result = {"error": str(exc)}
            self.action_log.append(request.action, payload, "error", result)
            raise

    def _execute(self, request: ActionRequest) -> dict[str, object]:
        if request.action == "screenshot":
            path = capture_screen(self.screenshot_dir, request.monitor_index)
            return {"path": str(path)}

        if request.action in {"move", "click", "double_click"}:
            if request.x is None or request.y is None:
                raise ValueError(f"{request.action} requires x and y")
            if request.action == "move":
                input_control.move_to(request.x, request.y)
            elif request.action == "click":
                input_control.click(request.x, request.y)
            else:
                input_control.double_click(request.x, request.y)
            return {"x": request.x, "y": request.y}

        if request.action == "type":
            if request.text is None:
                raise ValueError("type requires text")
            input_control.type_text(request.text)
            return {"chars": len(request.text)}

        if request.action == "hotkey":
            if not request.keys:
                raise ValueError("hotkey requires keys")
            input_control.hotkey(request.keys)
            return {"keys": request.keys}

        if request.action == "wait":
            input_control.wait(request.seconds)
            return {"seconds": request.seconds}

        raise ValueError(f"Unsupported action: {request.action}")
