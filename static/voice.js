const state = {
  history: [],
  interimTranscript: "",
  finalTranscript: "",
  isPressToTalk: false,
  isSceneRecording: false,
  scenePrompt:
    "請分析這段音訊的主要內容。請用繁體中文回答：1. 這是什麼類型的聲音 2. 可能的場景 3. 若有多種聲音，請列出主要聲音 回答請簡潔。",
};

const AUTO_CONTINUE_LIMIT = 2;
const CONTINUE_PROMPT = "請直接接續上一段回答，不要重複前文。";

const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const chatForm = document.getElementById("chatForm");
const chatMaxTokens = document.getElementById("chatMaxTokens");
const speechRate = document.getElementById("speechRate");
const featuredResponse = document.getElementById("featuredResponse");
const thinkingStatus = document.getElementById("thinkingStatus");
const healthBox = document.getElementById("health");
const serverStatus = document.getElementById("serverStatus");
const gpuStatus = document.getElementById("gpuStatus");
const micStatus = document.getElementById("micStatus");
const currentModelLabel = document.getElementById("currentModelLabel");
const liveTranscript = document.getElementById("liveTranscript");
const sceneResult = document.getElementById("sceneResult");
const sceneAudioStatus = document.getElementById("sceneAudioStatus");
const sceneAudioPlayer = document.getElementById("sceneAudioPlayer");
const startMicButton = document.getElementById("startMic");
const stopMicButton = document.getElementById("stopMic");
const stopOutputButton = document.getElementById("stopOutput");
const clearChatButton = document.getElementById("clearChat");
const startSceneAudioButton = document.getElementById("startSceneAudio");
const stopSceneAudioButton = document.getElementById("stopSceneAudio");
const playSceneAudioButton = document.getElementById("playSceneAudio");

const sentenceQueue = [];

let runtimeCurrentModelId = null;
let activeChatController = null;
let activeChatRunId = 0;
let speechVoice = null;
let isSpeaking = false;
let spokenSentenceOffset = 0;
let recognition = null;
let recognitionSupported = false;
let recognitionActive = false;
let pendingAutoSubmit = false;
let sceneMediaRecorder = null;
let sceneAudioChunks = [];
let sceneRecorderStream = null;
let sceneAudioBlobUrl = null;

function addMessage(role, text = "") {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  chatLog.appendChild(node);
  chatLog.scrollTop = chatLog.scrollHeight;
  return node;
}

function setThinking(text) {
  thinkingStatus.textContent = text;
}

function setFeatured(text) {
  featuredResponse.textContent = text;
}

function setTranscript(interim = "", finalText = "") {
  const merged = [finalText.trim(), interim.trim()].filter(Boolean).join(" ");
  liveTranscript.textContent = merged || "麥克風開始收音後，這裡會即時顯示辨識中的文字。";
}

function setSceneStatus(text) {
  sceneAudioStatus.textContent = text;
}

function findPreferredVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return (
    voices.find((voice) => /zh[-_]TW/i.test(voice.lang)) ||
    voices.find((voice) => /zh/i.test(voice.lang)) ||
    null
  );
}

function splitSpeakableSentences(text) {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const parts = normalized.match(/[^。！？!?]+[。！？!?]?/g) || [];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function enqueueSentencesFrom(fullText) {
  const sentences = splitSpeakableSentences(fullText);
  const newSentences = sentences.slice(spokenSentenceOffset);
  for (const sentence of newSentences) {
    if (/[。！？!?]$/.test(sentence)) {
      sentenceQueue.push(sentence);
      spokenSentenceOffset += 1;
    }
  }
  flushSpeechQueue();
}

function flushSpeechQueue() {
  if (!window.speechSynthesis || isSpeaking || !sentenceQueue.length) return;
  const text = sentenceQueue.shift();
  if (!text) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = Number(speechRate.value || 1);
  if (speechVoice) {
    utterance.voice = speechVoice;
  }
  isSpeaking = true;
  utterance.onend = () => {
    isSpeaking = false;
    flushSpeechQueue();
  };
  utterance.onerror = () => {
    isSpeaking = false;
    flushSpeechQueue();
  };
  window.speechSynthesis.speak(utterance);
}

function resetSpeechQueue() {
  sentenceQueue.length = 0;
  spokenSentenceOffset = 0;
  isSpeaking = false;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function loadVoices() {
  speechVoice = findPreferredVoice();
}

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
    // ignore
  }
}

async function stopActiveOutput() {
  if (activeChatController) {
    activeChatController.abort();
    activeChatController = null;
  }
  resetSpeechQueue();
  await requestBackendStop();
  setThinking("已停止目前輸出");
}

async function loadHealth() {
  try {
    const health = await fetchJson("/api/health");
    serverStatus.textContent = health.ok ? "在線" : "異常";
    gpuStatus.textContent = health.cuda_device || "N/A";
    runtimeCurrentModelId = health.current_model_id || null;
    currentModelLabel.textContent = runtimeCurrentModelId || "未載入";
    healthBox.textContent = `CUDA: ${health.cuda_available}\nGPU: ${health.cuda_device || "N/A"}\n目前模型: ${runtimeCurrentModelId || "none"}`;
  } catch (error) {
    serverStatus.textContent = "失敗";
    healthBox.textContent = String(error);
  }
}

async function streamNdjson(url, payload, onDelta) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
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
      if (item.type === "delta") {
        fullText += item.text;
        onDelta(fullText);
      } else if (item.type === "done") {
        donePayload = item;
      } else if (item.type === "error") {
        throw new Error(item.message);
      }
    }
  }

  if (!donePayload) {
    throw new Error("串流輸出沒有正常結束。");
  }

  return { ...donePayload, text: fullText };
}

async function streamChatTurn(message, history, assistantNode, existingText, signal, runId) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      model_id: runtimeCurrentModelId,
      max_new_tokens: Number(chatMaxTokens.value || 384),
    }),
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
      if (runId !== activeChatRunId) {
        throw new DOMException("Superseded by a newer chat run.", "AbortError");
      }
      if (item.type === "delta") {
        fullText += item.text;
        assistantNode.textContent = fullText;
        setFeatured(fullText);
        enqueueSentencesFrom(fullText);
      } else if (item.type === "done") {
        donePayload = item;
      } else if (item.type === "error") {
        throw new Error(item.message);
      }
    }
  }

  if (!donePayload) {
    throw new Error("文字串流沒有正常完成。");
  }

  return { ...donePayload, text: fullText };
}

async function submitChat(message) {
  if (!runtimeCurrentModelId) {
    throw new Error("請先回首頁載入 Gemma 模型。");
  }

  await stopActiveOutput();
  activeChatController = new AbortController();
  activeChatRunId += 1;
  const runId = activeChatRunId;
  spokenSentenceOffset = 0;

  addMessage("user", message);
  const assistantNode = addMessage("assistant", "");
  setThinking("Gemma 正在回覆中...");
  setFeatured("Gemma 正在整理回答...");

  let history = [...state.history];
  let fullText = "";
  let finalPayload = null;

  try {
    for (let pass = 0; pass <= AUTO_CONTINUE_LIMIT; pass += 1) {
      const currentMessage = pass === 0 ? message : CONTINUE_PROMPT;
      const result = await streamChatTurn(
        currentMessage,
        history,
        assistantNode,
        fullText,
        activeChatController.signal,
        runId
      );
      fullText = result.text;
      finalPayload = result;
      const truncated = result.generated_tokens >= Number(chatMaxTokens.value || 384);
      if (!truncated || pass === AUTO_CONTINUE_LIMIT) break;

      assistantNode.textContent = `${fullText}\n\n[提示] 回答碰到 token 上限，正在自動續寫...`;
      setThinking(`Gemma 正在續寫第 ${pass + 2} 段...`);
      history = [
        ...state.history,
        { role: "user", content: message },
        { role: "assistant", content: fullText },
      ];
    }
  } finally {
    if (runId === activeChatRunId) {
      activeChatController = null;
    }
  }

  state.history.push({ role: "user", content: message });
  state.history.push({ role: "assistant", content: fullText });

  const truncated = finalPayload.generated_tokens >= Number(chatMaxTokens.value || 384);
  const suffix = truncated ? "\n\n[注意] 本次回答可能被 token 上限截斷。" : "";

  const trailing = splitSpeakableSentences(fullText).slice(spokenSentenceOffset);
  for (const sentence of trailing) {
    sentenceQueue.push(sentence);
  }
  flushSpeechQueue();

  assistantNode.textContent = `${fullText}${suffix}\n\n[${finalPayload.model_id}] ${finalPayload.generated_tokens} tok in ${finalPayload.elapsed_sec}s (${finalPayload.tokens_per_sec} tok/s)`;
  setFeatured(fullText);
  setThinking(truncated ? "回答已完成，但可能還能再補充。" : `回答完成，速度約 ${finalPayload.tokens_per_sec} tok/s`);
  await loadHealth();
}

function updateMicStatus(text) {
  micStatus.textContent = text;
}

function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    recognitionSupported = false;
    updateMicStatus("瀏覽器不支援");
    startMicButton.disabled = true;
    stopMicButton.disabled = true;
    return;
  }

  recognitionSupported = true;
  recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    recognitionActive = true;
    state.finalTranscript = "";
    state.interimTranscript = "";
    setTranscript("", "");
    updateMicStatus("收音中");
    setThinking("正在聽你說話...");
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }
    if (finalText) {
      state.finalTranscript = `${state.finalTranscript} ${finalText}`.trim();
    }
    state.interimTranscript = interimText.trim();
    setTranscript(state.interimTranscript, state.finalTranscript);
  };

  recognition.onerror = (event) => {
    recognitionActive = false;
    if (event.error === "aborted") return;
    updateMicStatus(`語音辨識失敗: ${event.error}`);
    setThinking("語音辨識發生錯誤");
  };

  recognition.onend = async () => {
    recognitionActive = false;
    updateMicStatus("待機中");
    const transcript = `${state.finalTranscript} ${state.interimTranscript}`.trim();
    state.finalTranscript = "";
    state.interimTranscript = "";
    setTranscript("", transcript);

    if (pendingAutoSubmit && transcript) {
      pendingAutoSubmit = false;
      chatInput.value = transcript;
      try {
        await submitChat(transcript);
      } catch (error) {
        if (error?.name === "AbortError") return;
        addMessage("assistant", `Error: ${error.message}`);
        setThinking("回覆失敗");
      }
      return;
    }

    pendingAutoSubmit = false;
  };
}

function startVoiceCapture({ pressToTalk = false } = {}) {
  if (!recognitionSupported || recognitionActive) return;
  stopActiveOutput().catch(() => {});
  state.isPressToTalk = pressToTalk;
  pendingAutoSubmit = true;
  recognition.start();
}

function stopVoiceCapture() {
  if (!recognitionSupported || !recognitionActive) return;
  recognition.stop();
}

function shouldHandleSpacebar(event) {
  if (event.code !== "Space" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  const tag = event.target?.tagName?.toLowerCase();
  return !["textarea", "input", "select", "button"].includes(tag);
}

function getBestAudioMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function mixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += channelData[i] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleAudio(samples, sourceRate, targetRate) {
  if (sourceRate === targetRate) return samples;
  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    output[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return output;
}

async function blobToSamples(blob, targetRate = 16000) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const mono = mixToMono(decoded);
  const resampled = resampleAudio(mono, decoded.sampleRate, targetRate);
  await audioContext.close();
  return Array.from(resampled);
}

async function startSceneAudioCapture() {
  if (state.isSceneRecording) return;
  if (recognitionActive) {
    stopVoiceCapture();
  }
  await stopActiveOutput();
  resetSpeechQueue();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const mimeType = getBestAudioMimeType();
  sceneAudioChunks = [];
  if (sceneAudioBlobUrl) {
    URL.revokeObjectURL(sceneAudioBlobUrl);
    sceneAudioBlobUrl = null;
  }
  sceneAudioPlayer.pause();
  sceneAudioPlayer.removeAttribute("src");
  sceneAudioPlayer.hidden = true;
  sceneRecorderStream = stream;
  sceneMediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  sceneMediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      sceneAudioChunks.push(event.data);
    }
  };
  sceneMediaRecorder.start();
  state.isSceneRecording = true;
  setSceneStatus("收音中");
  sceneResult.textContent = "正在錄製環境聲音，完成後按「停止並辨識」。";
  setThinking("正在收集環境聲音...");
}

async function stopSceneAudioCaptureAndRecognize() {
  if (!state.isSceneRecording || !sceneMediaRecorder) return;

  const blob = await new Promise((resolve, reject) => {
    sceneMediaRecorder.onstop = () => {
      try {
        resolve(new Blob(sceneAudioChunks, { type: sceneMediaRecorder.mimeType || "audio/webm" }));
      } catch (error) {
        reject(error);
      }
    };
    sceneMediaRecorder.onerror = (event) => reject(event.error || new Error("Audio recording failed"));
    sceneMediaRecorder.stop();
  });

  state.isSceneRecording = false;
  setSceneStatus("分析中");
  sceneRecorderStream?.getTracks().forEach((track) => track.stop());
  sceneRecorderStream = null;
  sceneMediaRecorder = null;
  if (sceneAudioBlobUrl) {
    URL.revokeObjectURL(sceneAudioBlobUrl);
  }
  sceneAudioBlobUrl = URL.createObjectURL(blob);
  sceneAudioPlayer.src = sceneAudioBlobUrl;
  sceneAudioPlayer.hidden = false;

  const samples = await blobToSamples(blob, 16000);
  if (!samples.length) {
    throw new Error("沒有錄到可用的音訊內容。");
  }

  if (!runtimeCurrentModelId) {
    throw new Error("請先回首頁載入 Gemma 模型。");
  }
  if (!["e4b", "e4b-nvfp4a16"].includes(runtimeCurrentModelId)) {
    throw new Error("聲音場景識別目前請使用 e4b 或 e4b-nvfp4a16。");
  }

  await stopActiveOutput();
  spokenSentenceOffset = 0;
  sceneResult.textContent = "";
  setThinking("Gemma 正在分析這段環境聲音...");
  setFeatured("Gemma 正在聽環境聲音...");

  const payload = {
    samples,
    sample_rate: 16000,
    prompt: state.scenePrompt,
    model_id: runtimeCurrentModelId,
    max_new_tokens: 192,
  };

  const result = await streamNdjson("/api/audio/scene/stream", payload, (text) => {
    sceneResult.textContent = text;
    setFeatured(text);
    enqueueSentencesFrom(text);
  });

  const trailing = splitSpeakableSentences(result.text).slice(spokenSentenceOffset);
  for (const sentence of trailing) {
    sentenceQueue.push(sentence);
  }
  flushSpeechQueue();

  sceneResult.textContent = `${result.text}\n\n[${result.model_id}] ${result.generated_tokens} tok in ${result.elapsed_sec}s (${result.tokens_per_sec} tok/s)`;
  setFeatured(result.text);
  setSceneStatus("完成");
  setThinking(`聲音場景識別完成，速度約 ${result.tokens_per_sec} tok/s`);
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  try {
    await submitChat(message);
  } catch (error) {
    if (error?.name === "AbortError") return;
    addMessage("assistant", `Error: ${error.message}`);
    setThinking("回覆失敗");
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.prompt;
    chatInput.focus();
  });
});

startMicButton.addEventListener("click", () => startVoiceCapture({ pressToTalk: false }));
stopMicButton.addEventListener("click", () => stopVoiceCapture());
stopOutputButton.addEventListener("click", () => {
  stopActiveOutput().catch(() => {});
});

clearChatButton.addEventListener("click", async () => {
  await stopActiveOutput();
  state.history = [];
  chatLog.innerHTML = "";
  setFeatured("這裡會顯示 Gemma 最新一段回覆，方便你在展示時快速看目前回答的重點。");
  setThinking("對話已清空");
  setTranscript("", "");
  sceneResult.textContent = "按下「開始收音」後錄一段環境聲音，再按「停止並辨識」，Gemma 就會開始判斷這段聲音代表的場景。";
  setSceneStatus("待機中");
  sceneAudioPlayer.pause();
  sceneAudioPlayer.removeAttribute("src");
  sceneAudioPlayer.hidden = true;
  if (sceneAudioBlobUrl) {
    URL.revokeObjectURL(sceneAudioBlobUrl);
    sceneAudioBlobUrl = null;
  }
});

startSceneAudioButton.addEventListener("click", () => {
  startSceneAudioCapture().catch((error) => {
    sceneResult.textContent = error.message;
    setSceneStatus("失敗");
  });
});

stopSceneAudioButton.addEventListener("click", () => {
  stopSceneAudioCaptureAndRecognize().catch((error) => {
    sceneResult.textContent = error.message;
    setSceneStatus("失敗");
    setThinking("聲音場景識別失敗");
  });
});

playSceneAudioButton.addEventListener("click", () => {
  if (!sceneAudioBlobUrl) {
    sceneResult.textContent = "目前還沒有可播放的錄音，請先錄一段環境聲音。";
    return;
  }
  sceneAudioPlayer.hidden = false;
  sceneAudioPlayer.currentTime = 0;
  sceneAudioPlayer.play().catch((error) => {
    sceneResult.textContent = `播放錄音失敗：${error.message}`;
  });
});

window.addEventListener("keydown", (event) => {
  if (!shouldHandleSpacebar(event)) return;
  event.preventDefault();
  if (!recognitionActive) {
    startVoiceCapture({ pressToTalk: true });
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  if (state.isPressToTalk && recognitionActive) {
    event.preventDefault();
    state.isPressToTalk = false;
    stopVoiceCapture();
  }
});

window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
window.addEventListener("beforeunload", () => {
  resetSpeechQueue();
  sceneRecorderStream?.getTracks().forEach((track) => track.stop());
  if (sceneAudioBlobUrl) {
    URL.revokeObjectURL(sceneAudioBlobUrl);
  }
});

buildRecognition();
loadVoices();
loadHealth();
setInterval(() => {
  loadHealth().catch(() => {});
}, 10000);
