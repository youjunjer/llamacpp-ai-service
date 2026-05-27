let modelSelect = null;
let runtimeCurrentModel = null;
let runtimeStatus = null;
let progressFill = null;
let progressText = null;

async function fetchJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (_error) {
    throw new Error("WebUI 後端目前無法連線，請確認 run_webui.py 仍在執行，然後重新整理頁面。");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

function selectedLabel(id) {
  if (!modelSelect) return id || "none";
  const option = Array.from(modelSelect.options).find((item) => item.value === id);
  return option ? option.textContent : id || "none";
}

function ensureModelControlPanel() {
  if (modelSelect) return;

  const hero = document.querySelector(".landing-hero");
  const panel = document.createElement("section");
  panel.className = "model-control-card";
  panel.innerHTML = `
    <div class="model-control-head">
      <div>
        <p class="card-kicker">Gemma Runtime</p>
        <h2>模型管理中心</h2>
      </div>
      <div class="runtime-pill">
        <span>目前已載模型</span>
        <strong id="runtimeCurrentModel">none</strong>
      </div>
    </div>
    <div class="model-control-grid">
      <div>
        <label class="control-label" for="homeModelSelect">選擇 Gemma 模型</label>
        <select id="homeModelSelect"></select>
      </div>
      <div class="model-actions">
        <button id="loadModelButton" class="cta" type="button">載入選定模型</button>
        <button id="unloadModelButton" class="ghost-button" type="button">卸載目前模型</button>
        <button id="releaseMemoryButton" class="warn-button" type="button">徹底釋放模型記憶體</button>
      </div>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar">
        <div id="loadProgressFill" class="progress-fill"></div>
      </div>
      <div id="loadProgressText" class="progress-text">尚未開始載入</div>
    </div>
    <div id="runtimeStatus" class="runtime-status-box">請先載入 Gemma 模型。YOLO 不受這裡的模型控制影響。</div>
  `;

  hero.insertAdjacentElement("afterend", panel);
  modelSelect = document.getElementById("homeModelSelect");
  runtimeCurrentModel = document.getElementById("runtimeCurrentModel");
  runtimeStatus = document.getElementById("runtimeStatus");
  progressFill = document.getElementById("loadProgressFill");
  progressText = document.getElementById("loadProgressText");

  document.getElementById("loadModelButton").addEventListener("click", async () => {
    try {
      await loadSelectedModel();
    } catch (error) {
      showRuntimeError(error);
    }
  });

  document.getElementById("unloadModelButton").addEventListener("click", async () => {
    try {
      await unloadCurrentModel();
    } catch (error) {
      showRuntimeError(error);
    }
  });

  document.getElementById("releaseMemoryButton").addEventListener("click", async () => {
    try {
      await releaseMemoryAndRestart();
    } catch (error) {
      showRuntimeError(error);
    }
  });
}

function updateLoadProgress(loadState) {
  if (!progressFill || !progressText) return;

  const progress = Number(loadState?.progress || 0);
  progressFill.style.width = `${Math.max(0, Math.min(progress, 100))}%`;

  if (loadState?.active) {
    progressText.textContent = `${selectedLabel(loadState.model_id)} 載入中 ${progress}%${loadState.stage ? ` - ${loadState.stage}` : ""}`;
    return;
  }

  if (loadState?.error) {
    progressText.textContent = `載入失敗：${loadState.error}`;
    return;
  }

  if (loadState?.model_id && progress === 100) {
    progressText.textContent = `${selectedLabel(loadState.model_id)} 已就緒`;
    return;
  }

  progressText.textContent = "尚未開始載入";
}

async function loadModelOptions() {
  ensureModelControlPanel();
  const models = await fetchJson("/api/models");
  modelSelect.innerHTML = "";
  models.chat_models.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    if (item.recommended) option.selected = true;
    modelSelect.appendChild(option);
  });
}

async function loadHealth() {
  const server = document.getElementById("serverStatus");
  const gpu = document.getElementById("gpuStatus");
  const models = document.getElementById("loadedModels");

  try {
    const health = await fetchJson("/api/health");
    server.textContent = health.ok ? "在線" : "異常";
    gpu.textContent = health.cuda_device || "N/A";
    models.textContent = health.current_model_id ? selectedLabel(health.current_model_id) : "未載入";
  } catch (_error) {
    server.textContent = "離線";
    gpu.textContent = "N/A";
    models.textContent = "無法取得";
  }
}

async function loadRuntimeStatus() {
  const runtime = await fetchJson("/api/runtime/models");
  const currentId = runtime.current_model_id || null;

  runtimeCurrentModel.textContent = currentId ? selectedLabel(currentId) : "none";
  updateLoadProgress(runtime.load_state);

  if (runtime.load_state?.active) {
    runtimeStatus.textContent = `正在載入 ${selectedLabel(runtime.load_state.model_id)}，請稍候...`;
    return runtime;
  }

  if (runtime.load_state?.error) {
    runtimeStatus.textContent = `載入失敗：${runtime.load_state.error}`;
    return runtime;
  }

  runtimeStatus.textContent = currentId
    ? `目前已載入：${selectedLabel(currentId)}`
    : "目前沒有載入 Gemma 模型，請先從首頁載入後再進入展示頁。";
  return runtime;
}

async function pollUntilLoaded(targetModel) {
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const runtime = await loadRuntimeStatus();
    await loadHealth();

    if (!runtime.load_state?.active) {
      if (runtime.current_model_id === targetModel) {
        runtimeStatus.textContent = `${selectedLabel(targetModel)} 已載入完成。`;
        return;
      }
      if (runtime.load_state?.error) {
        throw new Error(runtime.load_state.error);
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("模型載入逾時。");
}

async function loadSelectedModel() {
  const targetModel = modelSelect.value;
  runtimeStatus.textContent = `正在啟動 ${selectedLabel(targetModel)} 的載入流程...`;

  const result = await fetchJson("/api/runtime/models/load", {
    method: "POST",
    body: JSON.stringify({ model_id: targetModel }),
  });

  updateLoadProgress(result.load_state);

  if (result.already_loaded) {
    runtimeCurrentModel.textContent = selectedLabel(targetModel);
    runtimeStatus.textContent = `${selectedLabel(targetModel)} 已經在記憶體中。`;
    await loadHealth();
    return;
  }

  await pollUntilLoaded(targetModel);
}

async function unloadCurrentModel() {
  runtimeStatus.textContent = "正在卸載模型...";
  const result = await fetchJson("/api/runtime/models/unload", {
    method: "POST",
  });

  runtimeCurrentModel.textContent = "none";
  updateLoadProgress({
    active: false,
    progress: 0,
    model_id: null,
    stage: "idle",
    error: null,
  });

  runtimeStatus.textContent = result.unloaded_models?.length
    ? `已卸載：${result.unloaded_models.join(", ")}`
    : "目前沒有可卸載的 Gemma 模型。";
  await loadHealth();
}

async function releaseMemoryAndRestart() {
  runtimeStatus.textContent = "正在停止生成、卸載模型並重啟 WebUI，請稍候...";
  updateLoadProgress({
    active: false,
    progress: 0,
    model_id: null,
    stage: "重新啟動中",
    error: null,
  });

  await fetchJson("/api/runtime/release-memory", {
    method: "POST",
  });

  const start = Date.now();
  while (Date.now() - start < 45000) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      await loadHealth();
      await loadRuntimeStatus();
      runtimeStatus.textContent = "WebUI 已重新啟動，模型記憶體已釋放。";
      return;
    } catch (_error) {
      // Wait for service restart.
    }
  }

  runtimeStatus.textContent = "WebUI 正在重新啟動中，請稍後重新整理頁面。";
}

function showRuntimeError(error) {
  runtimeStatus.textContent = `操作失敗：${error.message}`;
}

async function boot() {
  try {
    await loadModelOptions();
    await loadHealth();
    await loadRuntimeStatus();
  } catch (error) {
    showRuntimeError(error);
  }
}

boot();
setInterval(() => {
  loadHealth().catch(() => {});
  if (runtimeCurrentModel) {
    loadRuntimeStatus().catch(() => {});
  }
}, 10000);
