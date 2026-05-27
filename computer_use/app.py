from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .runner import ActionRequest, ComputerUseRunner


ROOT = Path(__file__).resolve().parent
runner = ComputerUseRunner(ROOT)
input_test_value = ""

app = FastAPI(title="Computer Use Prototype")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (ROOT / "static" / "index.html").read_text(encoding="utf-8")


@app.get("/api/state")
def state() -> dict[str, object]:
    return runner.state()


@app.post("/api/action")
def action(request: ActionRequest) -> dict[str, object]:
    try:
        return runner.run(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/input-test-value")
def get_input_test_value() -> dict[str, str]:
    return {"value": input_test_value}


@app.post("/api/input-test-value")
def set_input_test_value(payload: dict[str, str]) -> dict[str, str]:
    global input_test_value
    input_test_value = payload.get("value", "")
    return {"value": input_test_value}


@app.get("/api/latest-screenshot")
def latest_screenshot() -> FileResponse:
    screenshot_dir = ROOT / "logs" / "screenshots"
    screenshots = sorted(screenshot_dir.glob("*.png"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not screenshots:
        path = runner.run(ActionRequest(action="screenshot"))["path"]
        return FileResponse(str(path), media_type="image/png")
    return FileResponse(str(screenshots[0]), media_type="image/png")
