const serverStatus = document.getElementById("serverStatus");
const gpuStatus = document.getElementById("gpuStatus");
const gpuMemoryStatus = document.getElementById("gpuMemoryStatus");
const defaultModelStatus = document.getElementById("defaultModelStatus");
const healthBox = document.getElementById("health");
const yoloModel = document.getElementById("yoloModel");
const confThreshold = document.getElementById("confThreshold");
const maxDet = document.getElementById("maxDet");
const yoloResult = document.getElementById("yoloResult");
const thinkingStatus = document.getElementById("thinkingStatus");
const runYoloButton = document.getElementById("runYolo");
const startWebcamButton = document.getElementById("startWebcam");
const stopWebcamButton = document.getElementById("stopWebcam");
const fileInput = document.getElementById("fileInput");
const sourceUrl = document.getElementById("sourceUrl");
const youtubeUrl = document.getElementById("youtubeUrl");
const inputImage = document.getElementById("inputImage");
const inputVideo = document.getElementById("inputVideo");
const inputWebcamCanvas = document.getElementById("inputWebcamCanvas");
const outputImage = document.getElementById("outputImage");
const outputVideo = document.getElementById("outputVideo");
const inputOverlay = document.getElementById("inputOverlay");
const outputOverlay = document.getElementById("outputOverlay");
const inputMeta = document.getElementById("inputMeta");
const outputMeta = document.getElementById("outputMeta");
const tabs = Array.from(document.querySelectorAll(".tab-button"));
const panels = {
  webcam: document.getElementById("webcamPanel"),
  upload: document.getElementById("uploadPanel"),
  url: document.getElementById("urlPanel"),
  youtube: document.getElementById("youtubePanel"),
};
const presetButtons = Array.from(document.querySelectorAll(".preset-source"));

const state = {
  mode: "upload",
  busy: false,
  localPreviewUrl: "",
  activeJobId: "",
  webcamStream: null,
  webcamPreviewFrame: 0,
  previewKind: "",
  loopActive: false,
  loopToken: 0,
};
const captureCanvas = document.createElement("canvas");
const VIDEO_LOOP_INTERVAL_MS = 900;

function setWebcamSourceVideoMode(enabled) {
  inputVideo.controls = !enabled;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      detail = await response.text() || detail;
    }
    throw new Error(detail);
  }
  return response.json();
}

function resetMediaPreview(imageEl, videoEl, overlayEl, overlayText) {
  imageEl.hidden = true;
  imageEl.style.display = "none";
  imageEl.removeAttribute("src");
  videoEl.hidden = true;
  videoEl.style.display = "none";
  videoEl.controls = true;
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();
  overlayEl.hidden = false;
  overlayEl.style.display = "grid";
  overlayEl.textContent = overlayText;
}

function stopWebcamPreviewLoop() {
  if (state.webcamPreviewFrame) {
    cancelAnimationFrame(state.webcamPreviewFrame);
    state.webcamPreviewFrame = 0;
  }
}

function startWebcamPreviewLoop() {
  stopWebcamPreviewLoop();

  const ctx = inputWebcamCanvas.getContext("2d");
  const drawFrame = () => {
    if (!state.webcamStream || inputVideo.readyState < 2) {
      state.webcamPreviewFrame = requestAnimationFrame(drawFrame);
      return;
    }

    const width = inputVideo.videoWidth;
    const height = inputVideo.videoHeight;
    if (width && height) {
      if (inputWebcamCanvas.width !== width) {
        inputWebcamCanvas.width = width;
      }
      if (inputWebcamCanvas.height !== height) {
        inputWebcamCanvas.height = height;
      }
      ctx.drawImage(inputVideo, 0, 0, width, height);
    }

    state.webcamPreviewFrame = requestAnimationFrame(drawFrame);
  };

  state.webcamPreviewFrame = requestAnimationFrame(drawFrame);
}

function showMedia(imageEl, videoEl, overlayEl, url, kind) {
  overlayEl.hidden = true;
  overlayEl.style.display = "none";
  if (kind === "video") {
    imageEl.hidden = true;
    imageEl.style.display = "none";
    imageEl.removeAttribute("src");
    videoEl.controls = true;
    videoEl.hidden = false;
    videoEl.style.display = "block";
    videoEl.src = url;
    videoEl.load();
    return;
  }
  videoEl.hidden = true;
  videoEl.style.display = "none";
  videoEl.controls = true;
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();
  imageEl.hidden = false;
  imageEl.style.display = "block";
  imageEl.src = url;
}

function showOutputAnnotatedImage(dataUrl) {
  outputImage.hidden = false;
  outputImage.style.display = "block";
  outputImage.src = dataUrl;
  outputVideo.hidden = true;
  outputVideo.style.display = "none";
  outputVideo.pause();
  outputVideo.removeAttribute("src");
  outputVideo.load();
  outputOverlay.hidden = true;
  outputOverlay.style.display = "none";
}

function updateRunButtonState() {
  runYoloButton.textContent = state.loopActive ? "停止測試" : "開始測試";
  runYoloButton.classList.toggle("danger", state.loopActive);
}

function stopDetectionLoop() {
  state.loopActive = false;
  state.loopToken += 1;
  runYoloButton.disabled = false;
  updateRunButtonState();
}

function isPreviewVideoMode() {
  return state.mode === "webcam" || state.previewKind === "video";
}

function setMode(mode) {
  stopDetectionLoop();
  if (state.mode === "webcam" && mode !== "webcam") {
    stopWebcam();
  }
  state.mode = mode;
  state.previewKind = "";
  tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== mode;
  });
  resetOutputPreview();
  yoloResult.textContent = "這裡會顯示模型、FPS、處理時間、幀數與偵測類別摘要。";
  thinkingStatus.textContent = "等待測試";
  inputMeta.textContent = "尚未選擇";
  outputMeta.textContent = "尚未執行";

  if (state.localPreviewUrl) {
    URL.revokeObjectURL(state.localPreviewUrl);
    state.localPreviewUrl = "";
  }

  if (mode !== "upload") {
    fileInput.value = "";
    if (mode !== "webcam") {
      resetMediaPreview(inputImage, inputVideo, inputOverlay, "等待來源");
      inputWebcamCanvas.hidden = true;
      stopWebcamPreviewLoop();
    }
  } else {
    inputOverlay.textContent = "選擇圖片或影片後，按開始測試";
  }
  if (mode === "webcam") {
    inputImage.hidden = true;
    inputVideo.hidden = !state.webcamStream;
    setWebcamSourceVideoMode(Boolean(state.webcamStream));
    inputWebcamCanvas.hidden = !state.webcamStream;
    inputMeta.textContent = "Webcam 未啟動";
    inputOverlay.textContent = "先按「開啟 Webcam」，再按「開始測試」";
  }
}

function resetOutputPreview() {
  resetMediaPreview(outputImage, outputVideo, outputOverlay, "完成推論後會顯示標註結果");
}

function updateLocalUploadPreview() {
  stopDetectionLoop();
  const file = fileInput.files?.[0];
  if (!file) {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "選擇圖片或影片後，按開始測試");
    inputMeta.textContent = "尚未選擇";
    state.previewKind = "";
    return;
  }

  if (state.localPreviewUrl) {
    URL.revokeObjectURL(state.localPreviewUrl);
  }
  state.localPreviewUrl = URL.createObjectURL(file);
  const kind = file.type.startsWith("video/") ? "video" : "image";
  state.previewKind = kind;
  showMedia(inputImage, inputVideo, inputOverlay, state.localPreviewUrl, kind);
  inputMeta.textContent = `${file.name} (${kind === "video" ? "影片" : "圖片"})`;
}

function updateRemotePreview(url, mode) {
  stopDetectionLoop();
  if (!url) {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "等待來源");
    inputMeta.textContent = "尚未選擇";
    state.previewKind = "";
    return;
  }

  const isVideo = mode === "youtube" || /\.(mp4|mpeg|mpg|mov|avi|mkv|webm|m4v)(\?.*)?$/i.test(url);
  const previewUrl = mode === "youtube" ? "" : url.startsWith("/media/") ? url : `/media/proxy?url=${encodeURIComponent(url)}`;

  if (mode === "youtube") {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "YouTube 影片會由後端下載後再顯示結果影片");
    inputMeta.textContent = "YouTube 來源";
    state.previewKind = "";
    return;
  }

  state.previewKind = isVideo ? "video" : "image";
  showMedia(inputImage, inputVideo, inputOverlay, previewUrl, isVideo ? "video" : "image");
  inputMeta.textContent = isVideo ? "遠端影片" : "遠端圖片";
}

async function startWebcam() {
  stopDetectionLoop();
  if (state.webcamStream) {
    inputImage.hidden = true;
    inputVideo.hidden = false;
    setWebcamSourceVideoMode(true);
    inputWebcamCanvas.hidden = false;
    inputVideo.srcObject = state.webcamStream;
    inputOverlay.hidden = true;
    inputMeta.textContent = "Webcam 即時畫面";
    try {
      await inputVideo.play();
    } catch {
    }
    startWebcamPreviewLoop();
    state.previewKind = "video";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  state.webcamStream = stream;
  inputImage.hidden = true;
  inputImage.removeAttribute("src");
  inputVideo.hidden = false;
  setWebcamSourceVideoMode(true);
  inputVideo.muted = true;
  inputVideo.srcObject = stream;
  await new Promise((resolve) => {
    if (inputVideo.readyState >= 1) {
      resolve();
      return;
    }
    inputVideo.onloadedmetadata = () => resolve();
  });
  try {
    await inputVideo.play();
  } catch {
  }
  const width = inputVideo.videoWidth || stream.getVideoTracks()?.[0]?.getSettings?.().width;
  const height = inputVideo.videoHeight || stream.getVideoTracks()?.[0]?.getSettings?.().height;
  inputWebcamCanvas.hidden = false;
  startWebcamPreviewLoop();
  inputOverlay.hidden = true;
  state.previewKind = "video";
  inputMeta.textContent = width && height ? `Webcam 即時畫面 ${width}x${height}` : "Webcam 即時畫面";
}

function stopWebcam() {
  stopDetectionLoop();
  stopWebcamPreviewLoop();
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach((track) => track.stop());
    state.webcamStream = null;
  }
  inputVideo.pause();
  inputVideo.srcObject = null;
  setWebcamSourceVideoMode(false);
  inputWebcamCanvas.hidden = true;
  inputWebcamCanvas.width = 0;
  inputWebcamCanvas.height = 0;
  if (state.mode === "webcam") {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "先按「開啟 Webcam」，再按「開始測試」");
    inputMeta.textContent = "Webcam 未啟動";
  }
  state.previewKind = "";
}

function summarizeDetections(detections) {
  return detections.reduce((acc, item) => {
    acc[item.label] = (acc[item.label] || 0) + 1;
    return acc;
  }, {});
}

function captureWebcamFrame() {
  if (!state.webcamStream || !inputVideo.videoWidth || !inputVideo.videoHeight) {
    throw new Error("Webcam 尚未準備好");
  }
  captureCanvas.width = inputVideo.videoWidth;
  captureCanvas.height = inputVideo.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(inputVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.92);
}

function capturePreviewFrame() {
  if (!inputVideo.videoWidth || !inputVideo.videoHeight || inputVideo.readyState < 2) {
    throw new Error("影片預覽尚未準備好");
  }
  captureCanvas.width = inputVideo.videoWidth;
  captureCanvas.height = inputVideo.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(inputVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.92);
}

async function runFrameDetection(sourceLabel) {
  if (inputVideo.readyState < 2 || !inputVideo.videoWidth || !inputVideo.videoHeight) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const imageBase64 = state.mode === "webcam" ? captureWebcamFrame() : capturePreviewFrame();
  yoloResult.textContent = `已擷取${sourceLabel}影格，送往 YOLO 推論...`;
  outputMeta.textContent = "YOLO 處理中";

  const payload = await fetchJson("/api/yolo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      model_name: yoloModel.value,
      conf: Number(confThreshold.value),
      max_det: Number(maxDet.value),
    }),
  });

  showOutputAnnotatedImage(`data:image/jpeg;base64,${payload.annotated_image_base64}`);
  outputMeta.textContent = "YOLO 標註結果";
  yoloResult.textContent =
    `來源類型: ${state.mode}\n模型: ${payload.model_name}\nFPS: ${payload.fps}\n總耗時: ${payload.elapsed_sec} 秒\n摘要: ${JSON.stringify(summarizeDetections(payload.detections || []), null, 2)}`;
  thinkingStatus.textContent = "YOLO 測試完成";
  loadHealth().catch(() => {});
  return payload;
}

async function startDetectionLoop() {
  state.loopActive = true;
  state.loopToken += 1;
  const loopToken = state.loopToken;
  updateRunButtonState();
  thinkingStatus.textContent = "連續辨識中...";

  while (state.loopActive && loopToken === state.loopToken) {
    try {
      await runFrameDetection(state.mode === "webcam" ? " webcam " : "影片");
    } catch (error) {
      state.loopActive = false;
      updateRunButtonState();
      outputOverlay.hidden = false;
      outputOverlay.style.display = "grid";
      outputOverlay.textContent = error.message;
      yoloResult.textContent = error.message;
      thinkingStatus.textContent = "連續辨識失敗";
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, VIDEO_LOOP_INTERVAL_MS));
  }

  thinkingStatus.textContent = "已停止連續辨識";
  updateRunButtonState();
}

async function loadHealth() {
  try {
    const health = await fetchJson("/api/health");
    serverStatus.textContent = health.ok ? "正常" : "異常";
    gpuStatus.textContent = health.cuda_device || "N/A";
    gpuMemoryStatus.textContent = health.gpu_memory_total_gb
      ? `${health.gpu_memory_used_gb ?? "?"} / ${health.gpu_memory_total_gb} GB`
      : "N/A";
    defaultModelStatus.textContent = health.default_yolo_model || "N/A";
    healthBox.textContent =
      `CUDA: ${health.cuda_available}\n` +
      `GPU: ${health.cuda_device || "N/A"}\n` +
      `顯存: ${health.gpu_memory_used_gb ?? "N/A"} / ${health.gpu_memory_total_gb ?? "N/A"} GB\n` +
      `已載入模型: ${health.loaded_models.join(", ") || "none"}`;
  } catch (error) {
    serverStatus.textContent = "失敗";
    healthBox.textContent = String(error);
  }
}

async function loadModels() {
  const models = await fetchJson("/api/models");
  yoloModel.innerHTML = "";
  models.yolo_models.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    if (item.id === "yolov8x.pt") {
      option.selected = true;
    }
    yoloModel.appendChild(option);
  });
}

function summarizePayload(data) {
  const lines = [
    `來源類型: ${data.kind}`,
    `模型: ${data.model_name}`,
    `總耗時: ${data.elapsed_sec} 秒`,
  ];

  if (data.kind === "video") {
    lines.push(`推論 FPS: ${data.fps}`);
    lines.push(`整體處理 FPS: ${data.wall_fps}`);
    lines.push(`平均 inference: ${data.avg_inference_ms} ms`);
    lines.push(`已處理影格: ${data.processed_frames}`);
    lines.push(`原始影片 FPS: ${data.source_fps ?? "N/A"}`);
  } else {
    lines.push(`FPS: ${data.fps}`);
  }

  lines.push(`摘要: ${JSON.stringify(data.summary || {}, null, 2)}`);
  if (data.class_hits) {
    lines.push(`累計出現類別: ${JSON.stringify(data.class_hits, null, 2)}`);
  }
  return lines.join("\n");
}

async function runUpload() {
  const file = fileInput.files?.[0];
  if (!file) {
    throw new Error("請先選擇圖片或影片檔案");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_name", yoloModel.value);
  formData.append("conf", confThreshold.value);
  formData.append("max_det", maxDet.value);
  return fetchJson("/api/yolo/upload", {
    method: "POST",
    body: formData,
  });
}

async function runSource(url) {
  if (!url) {
    throw new Error(state.mode === "youtube" ? "請貼上 YouTube 連結" : "請貼上圖片或影片網址");
  }
  const normalizedUrl = url.startsWith("/") ? new URL(url, window.location.origin).href : url;
  return fetchJson("/api/yolo/source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_url: normalizedUrl,
      model_name: yoloModel.value,
      conf: Number(confThreshold.value),
      max_det: Number(maxDet.value),
    }),
  });
}

async function createSourceJob(url) {
  if (!url) {
    throw new Error(state.mode === "youtube" ? "請貼上 YouTube 連結" : "請貼上圖片或影片網址");
  }
  const normalizedUrl = url.startsWith("/") ? new URL(url, window.location.origin).href : url;
  return fetchJson("/api/yolo/source/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_url: normalizedUrl,
      model_name: yoloModel.value,
      conf: Number(confThreshold.value),
      max_det: Number(maxDet.value),
    }),
  });
}

async function pollSourceJob(jobId) {
  while (true) {
    const job = await fetchJson(`/api/yolo/source/jobs/${jobId}`);
    const progress = typeof job.progress === "number" ? `${job.progress}%` : "";
    thinkingStatus.textContent = job.message ? `${job.message}` : `處理中 ${progress}`;
    yoloResult.textContent =
      `狀態: ${job.status}\n` +
      `階段: ${job.stage || "running"}\n` +
      `進度: ${progress || "N/A"}`;

    if (job.status === "completed") {
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.message || "來源處理失敗");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function runYolo() {
  if (state.loopActive && isPreviewVideoMode()) {
    stopDetectionLoop();
    thinkingStatus.textContent = "正在停止連續辨識...";
    return;
  }
  if (state.busy) return;
  state.busy = true;
  runYoloButton.disabled = true;
  thinkingStatus.textContent = "YOLO 處理中...";
  yoloResult.textContent = "準備送出影格...";
  resetOutputPreview();

  try {
    let payload;
    if (state.mode === "webcam") {
      if (!state.webcamStream) {
        await startWebcam();
      }
      inputOverlay.hidden = true;
      inputOverlay.style.display = "none";
      inputMeta.textContent = "Webcam 即時畫面";
      runYoloButton.disabled = false;
      state.busy = false;
      startDetectionLoop().catch(() => {});
      return;
    } else if (state.previewKind === "video") {
      if (inputVideo.paused) {
        try {
          await inputVideo.play();
        } catch {
        }
      }
      inputOverlay.hidden = true;
      inputOverlay.style.display = "none";
      runYoloButton.disabled = false;
      state.busy = false;
      startDetectionLoop().catch(() => {});
      return;
    } else if (state.mode === "upload") {
      payload = await runUpload();
    } else {
      const sourceValue = state.mode === "url" ? sourceUrl.value.trim() : youtubeUrl.value.trim();
      const job = await createSourceJob(sourceValue);
      state.activeJobId = job.job_id;
      thinkingStatus.textContent = "準備下載媒體...";
      payload = await pollSourceJob(job.job_id);
    }

    showMedia(outputImage, outputVideo, outputOverlay, payload.output_media_url, payload.kind);
    outputMeta.textContent = payload.kind === "video" ? "標註後影片" : "標註後圖片";

    if (payload.input_media_url && state.mode !== "upload") {
      showMedia(inputImage, inputVideo, inputOverlay, payload.input_media_url, payload.kind);
      inputMeta.textContent = payload.kind === "video" ? "來源影片" : "來源圖片";
    }

    yoloResult.textContent = summarizePayload(payload);
    thinkingStatus.textContent = "YOLO 測試完成";
    loadHealth().catch(() => {});
  } catch (error) {
    thinkingStatus.textContent = "YOLO 測試失敗";
    outputOverlay.hidden = false;
    outputOverlay.style.display = "grid";
    outputOverlay.textContent = error.message;
    yoloResult.textContent = error.message;
  } finally {
    state.activeJobId = "";
    state.busy = false;
    runYoloButton.disabled = false;
  }
}

tabs.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

startWebcamButton?.addEventListener("click", () => {
  startWebcam().catch((error) => {
    inputOverlay.hidden = false;
    inputOverlay.textContent = error.message;
    inputMeta.textContent = "Webcam 啟動失敗";
  });
});

stopWebcamButton?.addEventListener("click", stopWebcam);
fileInput.addEventListener("change", updateLocalUploadPreview);
sourceUrl.addEventListener("input", () => updateRemotePreview(sourceUrl.value.trim(), "url"));
youtubeUrl.addEventListener("input", () => updateRemotePreview(youtubeUrl.value.trim(), "youtube"));
runYoloButton.addEventListener("click", () => {
  runYolo().catch((error) => {
    yoloResult.textContent = error.message;
  });
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode("url");
    sourceUrl.value = button.dataset.url;
    updateRemotePreview(sourceUrl.value.trim(), "url");
  });
});

updateRunButtonState();
loadHealth();
loadModels();
setInterval(loadHealth, 10000);
window.addEventListener("beforeunload", stopWebcam);
