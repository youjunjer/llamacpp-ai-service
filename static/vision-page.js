const webcam = document.getElementById("webcam");
const captureCanvas = document.getElementById("captureCanvas");
const capturedImage = document.getElementById("capturedImage");
const cameraOverlay = document.getElementById("cameraOverlay");
const cameraStatus = document.getElementById("cameraStatus");
const serverStatus = document.getElementById("serverStatus");
const gpuStatus = document.getElementById("gpuStatus");
const currentModelStatus = document.getElementById("currentModelStatus");
const healthBox = document.getElementById("health");
const visionModel = document.getElementById("visionModel");
const imageUrl = document.getElementById("imageUrl");
const visionPrompt = document.getElementById("visionPrompt");
const visionResult = document.getElementById("visionResult");
const thinkingStatus = document.getElementById("thinkingStatus");
const stopVisionOutputButton = document.getElementById("stopVisionOutput");
const startContinuousVisionButton = document.getElementById("startContinuousVision");
const stopContinuousVisionButton = document.getElementById("stopContinuousVision");

const state = { stream: null, capturedBase64: "", continuousVisionRunning: false };
const AUTO_CONTINUE_LIMIT = 2;
const CONTINUE_PROMPT = "請直接接續上一段回答，不要重複前文，維持原本格式繼續完成。";
const OFFICE_STATUS_PROMPT =
  '請觀察這張辦公室或工作現場圖片，判斷目前辦公狀態。狀態只能從以下四種選一個：缺席、專注、分心、睡覺。請只輸出最簡 JSON，不要輸出 Markdown，不要加任何額外說明。JSON 格式必須完全如下：{"狀態":"","說明":""}。判斷規則：沒有人或座位空著是缺席；正在看螢幕、打字、操作電腦或操作手機是專注；聊天、看旁邊、明顯沒有投入工作是分心；趴睡、閉眼休息或躺著是睡覺。說明請用一句繁體中文台灣常用語氣描述。';
const CONTINUOUS_VISION_INTERVAL_MS = 2500;

let runtimeCurrentModelId = null;
let activeVisionController = null;
let activeVisionRunId = 0;
let continuousVisionTimeout = null;

function proxyMediaUrl(url) {
  return `/media/proxy?url=${encodeURIComponent(url)}`;
}

async function fetchImageAsDataUrl(url) {
  const response = await fetch(proxyMediaUrl(url));
  if (!response.ok) {
    throw new Error("無法下載圖片網址內容");
  }
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("圖片轉換失敗"));
    reader.readAsDataURL(blob);
  });
}

function looksLikeCompleteJson(text) {
  const trimmed = (text || "").trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function formatVisionText(text) {
  const trimmed = (text || "").trim();
  if (!looksLikeCompleteJson(trimmed)) return text;

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch (_error) {
    return text;
  }
}

const SCENARIOS = {
  invoice: {
    imageUrl:
      "https://img.yec.tw/cl/api/res/1.2/wd26ZuDrSFKcI6lMtKbfdA--/YXBwaWQ9eXR3YXVjdGlvbnNlcnZpY2U7aD00MDU7cT04NTtyb3RhdGU9YXV0bzt3PTcwMA--/https://img.yec.tw/ob/image/379f4f98-c4de-412d-bb52-0e1b705584ab.jpg",
    prompt:
      "請讀取這張發票的重點資訊，包含店名、日期、總金額與主要品項，使用繁體中文台灣常用語氣條列整理。若有看不清楚的欄位，請明確標示不確定。",
  },
  traffic: {
    imageUrl:
      "https://d1qd3zoyy91a2c.cloudfront.net/image/rti/images/listimg/2026/2/large/20260221000103.jpg",
    prompt:
      '請觀察這張道路交通畫面，評估目前道路的擁擠程度，使用 0 到 9 表示，其中 0 代表幾乎沒有車流，9 代表非常壅塞。請只輸出 JSON，不要輸出 Markdown，不要加任何額外說明。JSON 格式如下：{"場景":"路況分析","壅擠程度_0到9":0,"路況說明":"","判斷原因":"","信心程度":0.0}。請使用繁體中文、台灣常用語氣。',
  },
  crowd: {
    imageUrl:
      "https://lh5.googleusercontent.com/proxy/chlHA95JLCTnI0tR63ZvnRaaGoLmw_lKcd8H5PP0xnGEpQ5Zkqq5BaOxmUKwdssH8X56DHMr3DrMlaaYDFmZMaU_Oj-x9KfJfemnVxb1fcgsfXghNWafIr1SZHECOO04",
    prompt:
      '請觀察這張圖片中的場景，先用繁體中文台灣常用語氣簡短說明目前場景，再估算畫面中可見的人數。請只輸出 JSON，不要輸出 Markdown，不要加任何額外說明。JSON 格式如下：{"場景":"人流計算","場景說明":"","人數":0,"判斷原因":"","信心程度":0.0}。如果人物有遮擋、重疊或畫質不足，請在「判斷原因」中明確說明這是估算值。',
  },
  industrialSafety: {
    imageUrl:
      "https://imgcdn.cna.com.tw/www/WebPhotos/800/20240514/1707x768_wmkn_0_C20240514000164.jpg",
    prompt:
      '請觀察這張工業或施工現場圖片，進行安全檢查。請使用繁體中文、台灣常用語氣，並只輸出 JSON，不要輸出 Markdown，不要加任何額外說明。JSON 格式如下：{"場景":"工業安全檢查","是否戴安全帽":"是/否/不確定","是否穿反光衣":"是/否/不確定","現場是否雜亂":"是/否/不確定","是否有掉落危險":"是/否/不確定","安全風險等級_0到9":0,"現場說明":"","判斷原因":"","建議改善事項":[],"信心程度":0.0}。請依照畫面可見內容判斷；若人物或物件看不清楚，請標示不確定，不要臆測。',
  },
  officeStatus: {
    imageUrl: "",
    prompt: OFFICE_STATUS_PROMPT,
  },
  medicine: {
    imageUrl: "https://img.ltn.com.tw/Upload/health/page/800/2013/09/05/250.jpg",
    prompt:
      "請先讀取這張藥袋上的藥名、劑量與服用方式，再整理每種藥品可能的常見副作用。若無法確認藥名，請明確說明不確定，並提醒使用者仍應以醫師或藥師指示為準。請使用繁體中文、台灣常用語氣。",
  },
  meal: {
    imageUrl: "https://fruitlovelife.com/wp-content/uploads/2025/06/IMG_2768.jpg",
    prompt: `請觀察這張餐點圖片，辨識餐點的主要組成內容，並估算整份餐點的熱量與主要營養成分。

請使用繁體中文、台灣常用語氣，並只輸出 JSON，不要加 Markdown，不要加額外說明，最後的備註，請以健康的角度進行說明。

JSON 格式如下：
{
  "場景": "餐點分析",
  "餐點摘要": "",
  "餐點項目": [
    {
      "名稱": "",
      "份量估計": "",
      "熱量_大卡": 0
    }
  ],
  "總熱量_大卡": 0,
  "營養成分估計": {
    "蛋白質_克": 0,
    "脂肪_克": 0,
    "碳水化合物_克": 0,
    "膳食纖維_克": 0
  },
  "信心程度": 0.0,
  "備註": ""
}

如果無法精確判斷，請明確寫出這是估算值。`,
  },
  businessCard: {
    imageUrl: "https://www.koe.url.tw/card/c_images/A/A001.jpg",
    prompt:
      "請讀取這張名片中的姓名、公司名稱、職稱、電話、電子郵件與地址，使用繁體中文台灣常用語氣條列整理；若欄位看不清楚，請明確標示不確定。",
  },
  poster: {
    imageUrl: "",
    prompt:
      "請閱讀這張海報或圖片中的主要文字與重點資訊，整理成繁體中文台灣常用語氣的摘要，並條列說明活動主題、時間、地點與注意事項；若有欄位看不清楚，請明確標示不確定。",
  },
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function requestBackendStop() {
  try {
    await fetchJson("/api/runtime/stop", { method: "POST" });
  } catch (_error) {
    // Ignore stop errors; front-end abort is still useful.
  }
}

async function stopVisionOutput() {
  if (activeVisionController) {
    activeVisionController.abort();
    activeVisionController = null;
  }
  await requestBackendStop();
  thinkingStatus.textContent = "已停止輸出";
}

function hideModelSelector() {
  if (!visionModel) return;
  visionModel.style.display = "none";
  const label = document.querySelector('label[for="visionModel"]');
  if (label) label.textContent = "目前使用首頁載入的 Gemma 模型";

  const current = document.createElement("div");
  current.className = "runtime-status";
  current.id = "visionCurrentModel";
  current.textContent = "目前尚未載入 Gemma 模型";
  visionModel.insertAdjacentElement("afterend", current);
}

async function loadHealth() {
  try {
    const health = await fetchJson("/api/health");
    serverStatus.textContent = health.ok ? "在線" : "異常";
    gpuStatus.textContent = health.cuda_device || "N/A";
    runtimeCurrentModelId = health.current_model_id || null;
    currentModelStatus.textContent = runtimeCurrentModelId || "未載入";

    const current = document.getElementById("visionCurrentModel");
    if (current) {
      current.textContent = runtimeCurrentModelId
        ? `目前已載模型：${runtimeCurrentModelId}`
        : "目前尚未載入 Gemma 模型";
    }

    healthBox.textContent = `CUDA: ${health.cuda_available}\nGPU: ${
      health.cuda_device || "N/A"
    }\n目前模型: ${runtimeCurrentModelId || "none"}`;
  } catch (error) {
    serverStatus.textContent = "檢查失敗";
    currentModelStatus.textContent = "無法取得";
    healthBox.textContent = String(error);
  }
}

async function startCamera() {
  if (state.stream) return;
  state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  webcam.srcObject = state.stream;
  cameraOverlay.hidden = true;
  cameraStatus.textContent = "鏡頭已啟動";
}

function stopCamera() {
  stopContinuousVision();
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  webcam.srcObject = null;
  state.capturedBase64 = "";
  capturedImage.removeAttribute("src");
  cameraOverlay.hidden = false;
  cameraOverlay.textContent = "請先啟動鏡頭，或直接貼上圖片網址。";
  cameraStatus.textContent = "鏡頭已關閉";
  thinkingStatus.textContent = "等待分析";
}

function captureFrame() {
  if (!webcam.videoWidth) return false;
  captureCanvas.width = webcam.videoWidth;
  captureCanvas.height = webcam.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(webcam, 0, 0, captureCanvas.width, captureCanvas.height);
  state.capturedBase64 = captureCanvas.toDataURL("image/jpeg", 0.92);
  capturedImage.src = state.capturedBase64;
  cameraStatus.textContent = "已擷取目前畫面";
  imageUrl.value = "";
  return true;
}

function compactJsonText(text) {
  const trimmed = (text || "").trim();
  if (!looksLikeCompleteJson(trimmed)) return trimmed;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch (_error) {
    return trimmed;
  }
}

async function streamVisionTurn(payload, existingText, signal, runId) {
  const response = await fetch("/api/vision/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = existingText;
  let donePayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);

      if (runId !== activeVisionRunId) {
        throw new DOMException("Superseded by a newer vision run.", "AbortError");
      }

      if (item.type === "start") {
        thinkingStatus.textContent = `模型思考中 (${item.model_id})`;
      } else if (item.type === "delta") {
        fullText += item.text;
        visionResult.textContent = fullText;
      } else if (item.type === "done") {
        donePayload = item;
      } else if (item.type === "error") {
        throw new Error(item.message);
      }
    }
  }

  if (!donePayload) {
    throw new Error("串流未正常完成");
  }

  return { ...donePayload, text: fullText };
}

async function runVision() {
  if (!runtimeCurrentModelId) {
    throw new Error("請先回首頁載入 Gemma 模型");
  }

  if (activeVisionController) {
    activeVisionController.abort();
  }
  activeVisionController = new AbortController();
  activeVisionRunId += 1;
  const runId = activeVisionRunId;

  const remoteUrl = imageUrl.value.trim();
  if (!remoteUrl && !state.capturedBase64 && !captureFrame()) {
    cameraStatus.textContent = "請先提供圖片";
    return;
  }

  if (remoteUrl) {
    capturedImage.src = proxyMediaUrl(remoteUrl);
    cameraStatus.textContent = "已載入圖片網址";
  }

  const imageBase64 = remoteUrl ? await fetchImageAsDataUrl(remoteUrl) : state.capturedBase64;
  let payload = {
    image_base64: imageBase64,
    image_url: null,
    prompt: visionPrompt.value,
    model_id: runtimeCurrentModelId,
    max_new_tokens: 384,
  };

  let fullText = "";
  let finalPayload = null;
  visionResult.textContent = "";
  thinkingStatus.textContent = "開始分析...";

  try {
    for (let pass = 0; pass <= AUTO_CONTINUE_LIMIT; pass += 1) {
      const result = await streamVisionTurn(
        payload,
        fullText,
        activeVisionController.signal,
        runId
      );
      fullText = result.text;
      finalPayload = result;

      const truncated = result.generated_tokens >= payload.max_new_tokens;
      const shouldContinue = truncated && !looksLikeCompleteJson(result.text);
      if (!shouldContinue || pass === AUTO_CONTINUE_LIMIT) break;

      visionResult.textContent = `${fullText}\n\n[提示] 這次回答碰到 token 上限，正在自動續寫...`;
      thinkingStatus.textContent = `正在續寫第 ${pass + 2} 段...`;
      payload = { ...payload, prompt: CONTINUE_PROMPT };
    }
  } finally {
    if (runId === activeVisionRunId) {
      activeVisionController = null;
    }
  }

  const truncated =
    finalPayload.generated_tokens >= payload.max_new_tokens &&
    !looksLikeCompleteJson(fullText);
  const suffix = truncated
    ? "\n\n[注意] 最後一段仍碰到 token 上限，內容可能被截斷。"
    : "";

  const displayText = formatVisionText(fullText);
  visionResult.textContent = `${displayText}${suffix}\n\n[${finalPayload.model_id}] ${finalPayload.generated_tokens} tok in ${finalPayload.elapsed_sec}s (${finalPayload.tokens_per_sec} tok/s)`;
  thinkingStatus.textContent = truncated ? "分析完成，但內容可能被截斷" : "圖像理解完成";
  await loadHealth();
}

async function runContinuousVisionOnce() {
  if (!runtimeCurrentModelId) {
    throw new Error("請先回首頁載入 Gemma 模型");
  }
  if (!state.stream) {
    await startCamera();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!captureFrame()) {
    throw new Error("尚未取得鏡頭畫面");
  }

  const result = await fetchJson("/api/vision", {
    method: "POST",
    body: JSON.stringify({
      image_base64: state.capturedBase64,
      image_url: null,
      prompt: visionPrompt.value,
      model_id: runtimeCurrentModelId,
      max_new_tokens: 160,
    }),
  });
  visionResult.textContent = compactJsonText(result.text || "");
  thinkingStatus.textContent = "連續辨識完成";
  await loadHealth();
}

async function continuousVisionLoop() {
  if (!state.continuousVisionRunning) return;
  try {
    thinkingStatus.textContent = "連續辨識中...";
    await runContinuousVisionOnce();
  } catch (error) {
    visionResult.textContent = error.message;
    thinkingStatus.textContent = "連續辨識失敗";
  }

  if (state.continuousVisionRunning) {
    continuousVisionTimeout = setTimeout(continuousVisionLoop, CONTINUOUS_VISION_INTERVAL_MS);
  }
}

async function startContinuousVision() {
  if (state.continuousVisionRunning) return;
  state.continuousVisionRunning = true;
  visionResult.textContent = "";
  thinkingStatus.textContent = "連續辨識啟動";
  startContinuousVisionButton.disabled = true;
  stopContinuousVisionButton.disabled = false;
  await continuousVisionLoop();
}

function stopContinuousVision() {
  state.continuousVisionRunning = false;
  if (continuousVisionTimeout) {
    clearTimeout(continuousVisionTimeout);
    continuousVisionTimeout = null;
  }
  if (startContinuousVisionButton) startContinuousVisionButton.disabled = false;
  if (stopContinuousVisionButton) stopContinuousVisionButton.disabled = true;
  if (thinkingStatus) thinkingStatus.textContent = "連續辨識已停止";
}

document.getElementById("startCamera").addEventListener("click", () =>
  startCamera().catch((error) => {
    cameraStatus.textContent = "鏡頭啟動失敗";
    cameraOverlay.hidden = false;
    cameraOverlay.textContent = error.message;
  })
);

document.getElementById("stopCamera").addEventListener("click", stopCamera);
document.getElementById("captureFrame").addEventListener("click", captureFrame);
startContinuousVisionButton.addEventListener("click", () =>
  startContinuousVision().catch((error) => {
    state.continuousVisionRunning = false;
    startContinuousVisionButton.disabled = false;
    stopContinuousVisionButton.disabled = true;
    visionResult.textContent = error.message;
    thinkingStatus.textContent = "連續辨識失敗";
  })
);
stopContinuousVisionButton.addEventListener("click", stopContinuousVision);
stopVisionOutputButton.addEventListener("click", () => {
  stopVisionOutput().catch(() => {});
});
document.getElementById("runVision").addEventListener("click", () =>
  runVision().catch((error) => {
    if (error?.name === "AbortError") return;
    visionResult.textContent = error.message;
    thinkingStatus.textContent = "分析失敗";
  })
);

document.querySelectorAll("[data-scenario]").forEach((button) => {
  button.addEventListener("click", async () => {
    const scenario = SCENARIOS[button.dataset.scenario];
    if (!scenario) return;

    visionPrompt.value = scenario.prompt;
    imageUrl.value = scenario.imageUrl || "";
    state.capturedBase64 = "";

    if (scenario.imageUrl) {
      capturedImage.src = proxyMediaUrl(scenario.imageUrl);
      cameraStatus.textContent = "已載入預設圖片";
    }

    if (button.dataset.autostart === "true") {
      try {
        await runVision();
      } catch (error) {
        if (error?.name === "AbortError") return;
        visionResult.textContent = error.message;
        thinkingStatus.textContent = "分析失敗";
      }
    }
  });
});

stopContinuousVisionButton.disabled = true;
window.addEventListener("beforeunload", () => {
  stopContinuousVision();
  stopCamera();
});

hideModelSelector();
loadHealth();
setInterval(() => {
  loadHealth().catch(() => {});
}, 10000);
