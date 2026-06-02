from __future__ import annotations

import base64
import binascii
import mimetypes
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse
from urllib.request import Request as UrlRequest, urlopen

import cv2
import numpy as np
import torch
import yt_dlp
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from ultralytics import YOLO


ROOT_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT_DIR / "static"
RUNTIME_DIR = ROOT_DIR / "runtime"
UPLOAD_DIR = RUNTIME_DIR / "uploads"
DOWNLOAD_DIR = RUNTIME_DIR / "downloads"
RESULT_DIR = RUNTIME_DIR / "results"

for directory in (RUNTIME_DIR, UPLOAD_DIR, DOWNLOAD_DIR, RESULT_DIR):
    directory.mkdir(parents=True, exist_ok=True)


class FrameRequest(BaseModel):
    image_base64: str
    model_name: str = "yolov8x.pt"
    conf: float = 0.25
    max_det: int = 24


class SourceRequest(BaseModel):
    source_url: str
    model_name: str = "yolov8x.pt"
    conf: float = 0.25
    max_det: int = 24


class YouTubeResolveRequest(BaseModel):
    youtube_url: str


@dataclass
class SourceJob:
    job_id: str
    request: SourceRequest
    status: str = "queued"
    stage: str = "queued"
    progress: int | None = None
    message: str = "queued"
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)


class YoloService:
    def __init__(self) -> None:
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.default_model = "yolov8x.pt"
        self._models: dict[str, YOLO] = {}
        self._lock = threading.Lock()

    def model_options(self) -> list[dict[str, str]]:
        options = []
        for model_name in ("yolo26n.pt", "yolov8x.pt"):
            label = model_name
            model_path = ROOT_DIR / model_name
            if model_path.exists():
                options.append({"id": model_name, "label": label})
        if not options:
            options.append({"id": self.default_model, "label": self.default_model})
        return options

    def health(self) -> dict[str, Any]:
        gpu_name = None
        gpu_total = None
        gpu_used = None
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            gpu_total = round(props.total_memory / (1024**3), 2)
            gpu_used = round(torch.cuda.memory_allocated(0) / (1024**3), 2)
        return {
            "ok": True,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device": gpu_name,
            "gpu_memory_total_gb": gpu_total,
            "gpu_memory_used_gb": gpu_used,
            "default_yolo_model": self.default_model,
            "loaded_models": sorted(self._models.keys()),
        }

    def _resolve_model_path(self, model_name: str) -> str:
        model_path = ROOT_DIR / model_name
        return str(model_path if model_path.exists() else model_name)

    def get_model(self, model_name: str) -> YOLO:
        with self._lock:
            if model_name not in self._models:
                self._models[model_name] = YOLO(self._resolve_model_path(model_name))
            return self._models[model_name]

    def _predict(self, model_name: str, source: Any, conf: float, max_det: int):
        model = self.get_model(model_name)
        start = time.perf_counter()
        results = model.predict(
            source=source,
            conf=conf,
            max_det=max_det,
            device=self.device,
            verbose=False,
        )
        elapsed = time.perf_counter() - start
        return results, elapsed

    def detect_image_bytes(self, image_bytes: bytes, model_name: str, conf: float, max_det: int) -> dict[str, Any]:
        np_bytes = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(np_bytes, cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image bytes.")
        return self.detect_image_array(image, model_name, conf, max_det)

    def detect_image_array(self, image: np.ndarray, model_name: str, conf: float, max_det: int) -> dict[str, Any]:
        results, elapsed = self._predict(model_name, image, conf, max_det)
        result = results[0]
        annotated = result.plot()
        ok, encoded = cv2.imencode(".jpg", annotated)
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to encode annotated image.")
        detections = self._extract_detections(result)
        fps = round((1 / elapsed) if elapsed > 0 else 0, 2)
        return {
            "kind": "image",
            "model_name": model_name,
            "annotated_image_base64": base64.b64encode(encoded.tobytes()).decode("ascii"),
            "detections": detections,
            "elapsed_sec": round(elapsed, 4),
            "fps": fps,
        }

    def process_image_file(self, input_path: Path, model_name: str, conf: float, max_det: int) -> dict[str, Any]:
        image = cv2.imread(str(input_path))
        if image is None:
            raise HTTPException(status_code=400, detail="Could not open uploaded image.")
        payload = self.detect_image_array(image, model_name, conf, max_det)
        output_path = RESULT_DIR / f"{input_path.stem}-{uuid.uuid4().hex[:8]}.jpg"
        image_bytes = base64.b64decode(payload["annotated_image_base64"])
        output_path.write_bytes(image_bytes)
        summary = summarize_detections(payload["detections"])
        return {
            "kind": "image",
            "model_name": model_name,
            "elapsed_sec": payload["elapsed_sec"],
            "fps": payload["fps"],
            "summary": summary,
            "class_hits": summary,
            "input_media_url": build_media_url(input_path),
            "output_media_url": build_media_url(output_path),
        }

    def process_video_file(self, input_path: Path, model_name: str, conf: float, max_det: int) -> dict[str, Any]:
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open video source.")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        source_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        if width <= 0 or height <= 0:
            cap.release()
            raise HTTPException(status_code=400, detail="Invalid video dimensions.")

        output_path = RESULT_DIR / f"{input_path.stem}-{uuid.uuid4().hex[:8]}.mp4"
        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            source_fps if source_fps > 0 else 20.0,
            (width, height),
        )

        total_frames = 0
        class_hits: dict[str, int] = {}
        inference_total = 0.0
        wall_start = time.perf_counter()

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                results, elapsed = self._predict(model_name, frame, conf, max_det)
                result = results[0]
                inference_total += elapsed
                detections = self._extract_detections(result)
                merge_counts(class_hits, summarize_detections(detections))
                writer.write(result.plot())
                total_frames += 1
        finally:
            cap.release()
            writer.release()

        wall_elapsed = time.perf_counter() - wall_start
        avg_inference_ms = round((inference_total / total_frames) * 1000, 2) if total_frames else 0.0
        wall_fps = round(total_frames / wall_elapsed, 2) if wall_elapsed > 0 else 0.0
        inference_fps = round(total_frames / inference_total, 2) if inference_total > 0 else 0.0
        return {
            "kind": "video",
            "model_name": model_name,
            "elapsed_sec": round(wall_elapsed, 4),
            "fps": inference_fps,
            "wall_fps": wall_fps,
            "avg_inference_ms": avg_inference_ms,
            "processed_frames": total_frames,
            "source_fps": round(source_fps, 2) if source_fps > 0 else None,
            "summary": class_hits,
            "class_hits": class_hits,
            "input_media_url": build_media_url(input_path),
            "output_media_url": build_media_url(output_path),
        }

    def _extract_detections(self, result) -> list[dict[str, Any]]:
        detections: list[dict[str, Any]] = []
        boxes = getattr(result, "boxes", None)
        names = getattr(result, "names", {})
        if boxes is None:
            return detections
        xyxy = boxes.xyxy.tolist() if boxes.xyxy is not None else []
        confs = boxes.conf.tolist() if boxes.conf is not None else []
        classes = boxes.cls.tolist() if boxes.cls is not None else []
        for idx, box in enumerate(xyxy):
            class_id = int(classes[idx]) if idx < len(classes) else -1
            detections.append(
                {
                    "label": names.get(class_id, str(class_id)),
                    "confidence": round(float(confs[idx]), 4) if idx < len(confs) else None,
                    "bbox": [round(float(value), 2) for value in box],
                }
            )
        return detections


def merge_counts(target: dict[str, int], source: dict[str, int]) -> None:
    for label, count in source.items():
        target[label] = target.get(label, 0) + count


def summarize_detections(detections: list[dict[str, Any]]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for item in detections:
        label = item.get("label", "unknown")
        summary[label] = summary.get(label, 0) + 1
    return summary


def build_media_url(path: Path) -> str:
    relative = path.resolve().relative_to(RUNTIME_DIR.resolve())
    return f"/media/{relative.as_posix()}"


def is_video_path(path: Path) -> bool:
    return path.suffix.lower() in {".mp4", ".mpeg", ".mpg", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def decode_data_url(value: str) -> bytes:
    payload = value.split(",", 1)[1] if "," in value else value
    try:
        return base64.b64decode(payload)
    except binascii.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.") from exc


def sanitize_filename(value: str, fallback: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in value).strip("._")
    return cleaned or fallback


def download_generic_file(url: str, dest_dir: Path, progress_cb=None) -> Path:
    request = UrlRequest(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=120) as response:
        filename = Path(urlparse(url).path).name or "download.bin"
        filename = sanitize_filename(filename, "download.bin")
        destination = dest_dir / f"{uuid.uuid4().hex[:8]}-{filename}"
        total = int(response.headers.get("Content-Length", "0") or 0)
        downloaded = 0
        with destination.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 512)
                if not chunk:
                    break
                handle.write(chunk)
                downloaded += len(chunk)
                if progress_cb and total > 0:
                    progress_cb(min(99, int(downloaded * 100 / total)), "downloading")
    return destination


def download_youtube_file(url: str, dest_dir: Path, progress_cb=None) -> Path:
    output_template = str(dest_dir / f"{uuid.uuid4().hex[:8]}-%(title).80s.%(ext)s")
    downloaded_file: dict[str, str] = {}

    def hook(status: dict[str, Any]) -> None:
        if status.get("status") == "downloading" and progress_cb:
            total = status.get("total_bytes") or status.get("total_bytes_estimate")
            downloaded = status.get("downloaded_bytes", 0)
            if total:
                progress_cb(min(99, int(downloaded * 100 / total)), "downloading")
        elif status.get("status") == "finished":
            downloaded_file["filename"] = status["filename"]
            if progress_cb:
                progress_cb(100, "downloaded")

    options = {
        "outtmpl": output_template,
        "format": "mp4/bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "progress_hooks": [hook],
        "quiet": True,
        "noprogress": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
        final_path = ydl.prepare_filename(info)
    path = Path(downloaded_file.get("filename") or final_path)
    if path.suffix.lower() not in {".mp4", ".webm", ".mkv", ".mov"}:
        mp4_candidate = path.with_suffix(".mp4")
        if mp4_candidate.exists():
            path = mp4_candidate
    return path


def build_proxy_media_url(url: str) -> str:
    return f"/media/proxy?url={quote(url, safe='')}"


def select_youtube_preview_format(info: dict[str, Any]) -> dict[str, Any]:
    formats = info.get("formats") or []
    progressive_candidates = []
    fallback_candidates = []

    for item in formats:
        stream_url = item.get("url")
        protocol = item.get("protocol") or ""
        if not stream_url or protocol not in {"https", "http", "m3u8_native", "m3u8"}:
            continue

        score = (
            1 if item.get("ext") == "mp4" else 0,
            1 if item.get("acodec") not in {None, "none"} else 0,
            int(item.get("height") or 0) <= 720,
            int(item.get("height") or 0),
            int(item.get("tbr") or 0),
        )
        if item.get("vcodec") not in {None, "none"} and item.get("acodec") not in {None, "none"}:
            progressive_candidates.append((score, item))
        elif item.get("vcodec") not in {None, "none"}:
            fallback_candidates.append((score, item))

    if progressive_candidates:
        progressive_candidates.sort(key=lambda entry: entry[0], reverse=True)
        return progressive_candidates[0][1]
    if fallback_candidates:
        fallback_candidates.sort(key=lambda entry: entry[0], reverse=True)
        return fallback_candidates[0][1]
    raise HTTPException(status_code=400, detail="No playable YouTube stream format was found.")


def resolve_youtube_stream(url: str) -> dict[str, Any]:
    options = {
        "quiet": True,
        "skip_download": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    selected = select_youtube_preview_format(info)
    stream_url = selected.get("url")
    if not stream_url:
        raise HTTPException(status_code=400, detail="Resolved YouTube stream is missing a playable URL.")

    return {
        "title": info.get("title") or "YouTube",
        "duration_sec": info.get("duration"),
        "width": selected.get("width"),
        "height": selected.get("height"),
        "fps": selected.get("fps"),
        "format_note": selected.get("format_note") or selected.get("format_id"),
        "stream_url": stream_url,
    }


def stream_remote_response(response, chunk_size: int = 1024 * 256):
    try:
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            yield chunk
    finally:
        try:
            response.close()
        except Exception:
            pass


service = YoloService()
jobs: dict[str, SourceJob] = {}
jobs_lock = threading.Lock()

app = FastAPI(title="YOLO WebUI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=RedirectResponse)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/yolo", status_code=302)


@app.head("/")
async def root_head() -> RedirectResponse:
    return RedirectResponse(url="/yolo", status_code=302)


@app.get("/yolo", response_class=HTMLResponse)
async def yolo_page() -> HTMLResponse:
    return HTMLResponse((STATIC_DIR / "yolo.html").read_text(encoding="utf-8"))


@app.get("/assets/{asset_path:path}")
async def asset_file(asset_path: str) -> FileResponse:
    path = STATIC_DIR / asset_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found.")
    return FileResponse(path)


@app.get("/media/proxy")
async def media_proxy(request: Request, url: str) -> StreamingResponse:
    headers = {"User-Agent": "Mozilla/5.0"}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    upstream_request = UrlRequest(url, headers=headers)
    upstream_response = urlopen(upstream_request, timeout=60)
    content_type = upstream_response.headers.get("Content-Type") or "application/octet-stream"
    response_headers = {
        "Accept-Ranges": upstream_response.headers.get("Accept-Ranges", "bytes"),
    }

    for header_name in ("Content-Length", "Content-Range", "Cache-Control", "ETag", "Last-Modified"):
        header_value = upstream_response.headers.get(header_name)
        if header_value:
            response_headers[header_name] = header_value

    return StreamingResponse(
        stream_remote_response(upstream_response),
        media_type=content_type,
        status_code=getattr(upstream_response, "status", 200),
        headers=response_headers,
    )


@app.get("/media/{media_path:path}")
async def media_file(media_path: str) -> FileResponse:
    path = (RUNTIME_DIR / media_path).resolve()
    if RUNTIME_DIR.resolve() not in path.parents and path != RUNTIME_DIR.resolve():
        raise HTTPException(status_code=403, detail="Forbidden path.")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found.")
    media_type, _ = mimetypes.guess_type(path.name)
    return FileResponse(path, media_type=media_type)


@app.get("/api/health")
async def api_health() -> dict[str, Any]:
    return service.health()


@app.get("/api/models")
async def api_models() -> dict[str, Any]:
    return {"yolo_models": service.model_options()}


@app.post("/api/youtube/resolve")
async def api_youtube_resolve(payload: YouTubeResolveRequest) -> dict[str, Any]:
    resolved = resolve_youtube_stream(payload.youtube_url)
    return {
        "title": resolved["title"],
        "duration_sec": resolved["duration_sec"],
        "width": resolved["width"],
        "height": resolved["height"],
        "fps": resolved["fps"],
        "format_note": resolved["format_note"],
        "stream_proxy_url": build_proxy_media_url(resolved["stream_url"]),
    }


@app.post("/api/yolo")
async def api_yolo(payload: FrameRequest) -> dict[str, Any]:
    image_bytes = decode_data_url(payload.image_base64)
    return service.detect_image_bytes(image_bytes, payload.model_name, payload.conf, payload.max_det)


@app.post("/api/yolo/upload")
async def api_yolo_upload(
    file: UploadFile = File(...),
    model_name: str = Form("yolov8x.pt"),
    conf: float = Form(0.25),
    max_det: int = Form(24),
) -> dict[str, Any]:
    filename = sanitize_filename(file.filename or "upload.bin", "upload.bin")
    saved_path = UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}-{filename}"
    with saved_path.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)
    if is_video_path(saved_path):
        return service.process_video_file(saved_path, model_name, conf, max_det)
    return service.process_image_file(saved_path, model_name, conf, max_det)


def process_source_request(job: SourceJob) -> None:
    try:
        job.status = "running"
        job.stage = "preparing"
        job.message = "Preparing source..."
        parsed = urlparse(job.request.source_url)
        url = job.request.source_url

        def update(progress: int, stage: str) -> None:
            job.progress = progress
            job.stage = stage
            if stage == "downloading":
                job.message = f"Downloading {progress}%"
            elif stage == "downloaded":
                job.message = "Download complete, starting YOLO..."

        if "youtube.com" in parsed.netloc or "youtu.be" in parsed.netloc:
            source_path = download_youtube_file(url, DOWNLOAD_DIR, update)
        elif parsed.scheme in {"http", "https"}:
            source_path = download_generic_file(url, DOWNLOAD_DIR, update)
        else:
            raise HTTPException(status_code=400, detail="Unsupported source URL.")

        job.progress = 100
        job.stage = "processing"
        job.message = "Running YOLO..."
        if is_video_path(source_path):
            result = service.process_video_file(source_path, job.request.model_name, job.request.conf, job.request.max_det)
        else:
            result = service.process_image_file(source_path, job.request.model_name, job.request.conf, job.request.max_det)
        job.result = result
        job.status = "completed"
        job.message = "Completed"
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.message = str(exc)


@app.post("/api/yolo/source")
async def api_yolo_source(payload: SourceRequest) -> dict[str, Any]:
    job = SourceJob(job_id=uuid.uuid4().hex, request=payload)
    process_source_request(job)
    if job.status == "failed":
        raise HTTPException(status_code=500, detail=job.error or "Source processing failed.")
    return job.result or {}


@app.post("/api/yolo/source/jobs")
async def api_yolo_source_jobs(payload: SourceRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    job = SourceJob(job_id=uuid.uuid4().hex, request=payload)
    with jobs_lock:
        jobs[job.job_id] = job
    background_tasks.add_task(process_source_request, job)
    return {"job_id": job.job_id}


@app.get("/api/yolo/source/jobs/{job_id}")
async def api_yolo_source_job(job_id: str) -> dict[str, Any]:
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "message": job.message,
        "result": job.result,
    }
