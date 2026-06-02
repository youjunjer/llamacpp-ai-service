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
const presetButtons = Array.from(document.querySelectorAll(".preset-source"));
const panels = {
  webcam: document.getElementById("webcamPanel"),
  upload: document.getElementById("uploadPanel"),
  url: document.getElementById("urlPanel"),
  youtube: document.getElementById("youtubePanel"),
};

const state = {
  mode: "upload",
  busy: false,
  localPreviewUrl: "",
  activeJobId: "",
  previewUrl: "",
  webcamStream: null,
  webcamPreviewFrame: 0,
  previewKind: "",
  loopActive: false,
  loopToken: 0,
  youtubeResolveToken: 0,
  youtubeResolveTimer: 0,
};

const captureCanvas = document.createElement("canvas");
const VIDEO_LOOP_INTERVAL_MS = 900;
const YOUTUBE_RESOLVE_DELAY_MS = 700;

function setWebcamSourceVideoMode(enabled) {
  inputVideo.controls = !enabled;
}

function renderResultSummary({ fps = "-", kind = "-", modelName = "-" } = {}) {
  yoloResult.textContent = `FPS: ${fps}\n資料類型: ${kind}\n模型: ${modelName}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      detail = (await response.text()) || detail;
    }
    throw new Error(detail);
  }
  return response.json();
}

function clearYoutubeResolveTimer() {
  if (state.youtubeResolveTimer) {
    clearTimeout(state.youtubeResolveTimer);
    state.youtubeResolveTimer = 0;
  }
}

function resetMediaPreview(imageEl, videoEl, overlayEl, overlayText) {
  imageEl.hidden = true;
  imageEl.style.display = "none";
  imageEl.removeAttribute("src");
  videoEl.hidden = true;
  videoEl.style.display = "none";
  videoEl.controls = true;
  videoEl.pause();
  videoEl.srcObject = null;
  videoEl.removeAttribute("src");
  videoEl.load();
  overlayEl.hidden = false;
  overlayEl.style.display = "grid";
  overlayEl.textContent = overlayText;
}

function resetOutputPreview() {
  resetMediaPreview(outputImage, outputVideo, outputOverlay, "完成推論後會顯示標註結果");
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
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.removeAttribute("poster");
    videoEl.preload = "auto";
    videoEl.controls = true;
    videoEl.hidden = false;
    videoEl.style.display = "block";
    videoEl.src = url;
    videoEl.load();

    const tryPlay = () => {
      const maybePromise = videoEl.play();
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    };

    if (videoEl.readyState >= 2) {
      tryPlay();
    } else {
      videoEl.onloadeddata = () => {
        videoEl.onloadeddata = null;
        tryPlay();
      };
    }
    return;
  }

  videoEl.hidden = true;
  videoEl.style.display = "none";
  videoEl.controls = true;
  videoEl.pause();
  videoEl.srcObject = null;
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
  return state.mode === "webcam" || state.previewKind === "video" || (state.mode === "url" && state.previewKind === "image");
}

function setMode(mode) {
  stopDetectionLoop();
  clearYoutubeResolveTimer();
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
  renderResultSummary();
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
      resetMediaPreview(inputImage, inputVideo, inputOverlay, "尚未載入來源");
      inputWebcamCanvas.hidden = true;
      stopWebcamPreviewLoop();
    }
  } else {
    inputOverlay.textContent = "選擇圖片或影片後開始測試";
  }

  if (mode === "webcam") {
    inputImage.hidden = true;
    inputVideo.hidden = !state.webcamStream;
    setWebcamSourceVideoMode(Boolean(state.webcamStream));
    inputWebcamCanvas.hidden = !state.webcamStream;
    inputMeta.textContent = "Webcam";
    inputOverlay.textContent = "先按「開啟 Webcam」，再按「開始測試」";
  }

  if (mode === "youtube") {
    inputOverlay.textContent = "貼上 YouTube 連結後，系統會先解析可播放串流";
    if (youtubeUrl.value.trim()) {
      scheduleYouTubeResolve(youtubeUrl.value.trim());
    }
  }
}

function updateLocalUploadPreview() {
  stopDetectionLoop();
  const file = fileInput.files?.[0];
  if (!file) {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "選擇圖片或影片後開始測試");
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
  state.previewUrl = state.localPreviewUrl;
  showMedia(inputImage, inputVideo, inputOverlay, state.localPreviewUrl, kind);
  inputMeta.textContent = `${file.name} (${kind === "video" ? "影片" : "圖片"})`;
}

function updateRemotePreview(url, mode) {
  stopDetectionLoop();
  if (!url) {
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "尚未載入來源");
    inputMeta.textContent = "尚未選擇";
    state.previewKind = "";
    return;
  }

  const isVideo = /\.(mp4|mpeg|mpg|mov|avi|mkv|webm|m4v)(\?.*)?$/i.test(url);
  const previewUrl = url.startsWith("/media/")
    ? url
    : `/media/proxy?url=${encodeURIComponent(url)}`;

  state.previewKind = isVideo ? "video" : "image";
  state.previewUrl = previewUrl;
  showMedia(inputImage, inputVideo, inputOverlay, previewUrl, state.previewKind);
  inputMeta.textContent = isVideo ? "遠端影片" : "遠端圖片";
}

async function resolveYouTubePreview(url, token) {
  try {
    thinkingStatus.textContent = "解析 YouTube 串流中...";
    inputOverlay.hidden = false;
    inputOverlay.style.display = "grid";
    inputOverlay.textContent = "正在解析 YouTube 串流...";

    const payload = await fetchJson("/api/youtube/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: url }),
    });

    if (token !== state.youtubeResolveToken || state.mode !== "youtube") {
      return;
    }

    state.previewKind = "video";
    state.previewUrl = payload.stream_proxy_url;
    showMedia(inputImage, inputVideo, inputOverlay, payload.stream_proxy_url, "video");
    inputMeta.textContent = payload.height
      ? `${payload.title} (${payload.height}p)`
      : payload.title;
    thinkingStatus.textContent = "YouTube 預覽已就緒";
    renderResultSummary({
      fps: "-",
      kind: "youtube-video",
      modelName: yoloModel.value,
    });
  } catch (error) {
    if (token !== state.youtubeResolveToken || state.mode !== "youtube") {
      return;
    }
    state.previewKind = "";
    resetMediaPreview(inputImage, inputVideo, inputOverlay, error.message);
    inputMeta.textContent = "YouTube 解析失敗";
    thinkingStatus.textContent = "YouTube 解析失敗";
  }
}

function scheduleYouTubeResolve(url) {
  stopDetectionLoop();
  clearYoutubeResolveTimer();
  if (!url) {
    state.youtubeResolveToken += 1;
    state.previewKind = "";
    resetMediaPreview(inputImage, inputVideo, inputOverlay, "貼上 YouTube 連結後，系統會先解析可播放串流");
    inputMeta.textContent = "尚未選擇";
    return;
  }

  state.previewKind = "";
  state.youtubeResolveToken += 1;
  const token = state.youtubeResolveToken;
  inputOverlay.hidden = false;
  inputOverlay.style.display = "grid";
  inputOverlay.textContent = "準備解析 YouTube 串流...";
  inputMeta.textContent = "YouTube 解析中";

  state.youtubeResolveTimer = window.setTimeout(() => {
    resolveYouTubePreview(url, token).catch(() => {});
  }, YOUTUBE_RESOLVE_DELAY_MS);
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
    inputMeta.textContent = "Webcam";
  }
  state.previewKind = "";
}

function captureWebcamFrame() {
  if (!state.webcamStream || !inputVideo.videoWidth || !inputVideo.videoHeight) {
    throw new Error("Webcam 尚未就緒");
  }
  captureCanvas.width = inputVideo.videoWidth;
  captureCanvas.height = inputVideo.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(inputVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.92);
}

function capturePreviewFrame() {
  if (!inputVideo.videoWidth || !inputVideo.videoHeight || inputVideo.readyState < 2) {
    throw new Error("影片尚未載入完成");
  }
  captureCanvas.width = inputVideo.videoWidth;
  captureCanvas.height = inputVideo.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(inputVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.92);
}

function capturePreviewImageFrame() {
  if (!inputImage.src || !inputImage.complete || !inputImage.naturalWidth || !inputImage.naturalHeight) {
    throw new Error("圖片尚未載入完成");
  }
  captureCanvas.width = inputImage.naturalWidth;
  captureCanvas.height = inputImage.naturalHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(inputImage, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.92);
}

async function runFrameDetection() {
  if (inputVideo.readyState < 2 || !inputVideo.videoWidth || !inputVideo.videoHeight) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const imageBase64 = state.mode === "webcam" ? captureWebcamFrame() : capturePreviewFrame();
  renderResultSummary({
    fps: "...",
    kind: state.mode === "webcam" ? "webcam" : state.mode === "youtube" ? "youtube-video" : "video",
    modelName: yoloModel.value,
  });
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
  renderResultSummary({
    fps: payload.fps,
    kind: state.mode === "webcam" ? "webcam" : state.mode === "youtube" ? "youtube-video" : "video",
    modelName: payload.model_name,
  });
  thinkingStatus.textContent = "YOLO 測試完成";
  loadHealth().catch(() => {});
  return payload;
}

async function runImageDetectionFromPreview(kindLabel) {
  const imageBase64 = capturePreviewImageFrame();
  renderResultSummary({
    fps: "...",
    kind: kindLabel,
    modelName: yoloModel.value,
  });
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
  renderResultSummary({
    fps: payload.fps,
    kind: kindLabel,
    modelName: payload.model_name,
  });
  thinkingStatus.textContent = "YOLO 測試完成";
  loadHealth().catch(() => {});
  return payload;
}

async function refreshRemoteImagePreview() {
  if (state.mode !== "url" || state.previewKind !== "image" || !state.previewUrl) {
    return;
  }
  const separator = state.previewUrl.includes("?") ? "&" : "?";
  const freshUrl = `${state.previewUrl}${separator}_ts=${Date.now()}`;
  await new Promise((resolve, reject) => {
    inputImage.onload = () => {
      inputImage.onload = null;
      inputImage.onerror = null;
      resolve();
    };
    inputImage.onerror = () => {
      inputImage.onload = null;
      inputImage.onerror = null;
      reject(new Error("遠端圖片更新失敗"));
    };
    inputImage.src = freshUrl;
  });
}

async function startDetectionLoop(detector = runFrameDetection) {
  state.loopActive = true;
  state.loopToken += 1;
  const loopToken = state.loopToken;
  updateRunButtonState();
  thinkingStatus.textContent = "連續辨識中...";

  while (state.loopActive && loopToken === state.loopToken) {
    try {
      await detector();
    } catch (error) {
      state.loopActive = false;
      updateRunButtonState();
      outputOverlay.hidden = false;
      outputOverlay.style.display = "grid";
      outputOverlay.textContent = error.message;
      renderResultSummary({
        fps: "error",
        kind: state.previewKind || state.mode,
        modelName: yoloModel.value,
      });
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

async function runUpload() {
  const file = fileInput.files?.[0];
  if (!file) {
    throw new Error("請先選擇圖片或影片");
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

async function createSourceJob(url) {
  if (!url) {
    throw new Error("請輸入媒體網址");
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
    renderResultSummary({
      fps: job.status === "completed" ? "-" : "...",
      kind: job.stage === "processing" ? "video/image" : "-",
      modelName: yoloModel.value,
    });

    if (job.status === "completed") {
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.message || "處理失敗");
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
  renderResultSummary({
    fps: "...",
    kind: state.previewKind || state.mode,
    modelName: yoloModel.value,
  });
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
    }

    if (state.previewKind === "video") {
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
    }

    if (state.mode === "url" && state.previewKind === "image") {
      inputOverlay.hidden = true;
      inputOverlay.style.display = "none";
      runYoloButton.disabled = false;
      state.busy = false;
      startDetectionLoop(async () => {
        await refreshRemoteImagePreview();
        return runImageDetectionFromPreview("url-image");
      }).catch(() => {});
      return;
    }

    if (state.mode === "youtube") {
      if (state.previewKind === "video") {
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
      }
      throw new Error("YouTube 影片仍在解析中，請等左側預覽出現後再開始測試");
    }

    if (state.mode === "upload") {
      payload = await runUpload();
    } else {
      const sourceValue = state.mode === "youtube" ? youtubeUrl.value.trim() : sourceUrl.value.trim();
      const job = await createSourceJob(sourceValue);
      state.activeJobId = job.job_id;
      thinkingStatus.textContent = "開始處理來源...";
      payload = await pollSourceJob(job.job_id);
    }

    showMedia(outputImage, outputVideo, outputOverlay, payload.output_media_url, payload.kind);
    outputMeta.textContent = payload.kind === "video" ? "標註後影片" : "標註後圖片";

    if (payload.input_media_url && state.mode !== "upload") {
      showMedia(inputImage, inputVideo, inputOverlay, payload.input_media_url, payload.kind);
      inputMeta.textContent = payload.kind === "video" ? "原始影片" : "原始圖片";
    }

    renderResultSummary({
      fps: payload.fps ?? "-",
      kind: payload.kind ?? "-",
      modelName: payload.model_name ?? yoloModel.value,
    });
    thinkingStatus.textContent = "YOLO 測試完成";
    loadHealth().catch(() => {});
  } catch (error) {
    thinkingStatus.textContent = "YOLO 測試失敗";
    outputOverlay.hidden = false;
    outputOverlay.style.display = "grid";
    outputOverlay.textContent = error.message;
    renderResultSummary({
      fps: "error",
      kind: state.previewKind || state.mode,
      modelName: yoloModel.value,
    });
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
youtubeUrl.addEventListener("input", () => scheduleYouTubeResolve(youtubeUrl.value.trim()));
runYoloButton.addEventListener("click", () => {
  runYolo().catch(() => {
    renderResultSummary({
      fps: "error",
      kind: state.previewKind || state.mode,
      modelName: yoloModel.value,
    });
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
renderResultSummary();
loadHealth();
loadModels();
setInterval(loadHealth, 10000);
window.addEventListener("beforeunload", () => {
  clearYoutubeResolveTimer();
  stopWebcam();
});
