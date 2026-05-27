const screenshot = document.querySelector("#screenshot");
const log = document.querySelector("#log");
const position = document.querySelector("#position");
const dryRun = document.querySelector("#dryRun");

function payload(action) {
  return {
    action,
    x: Number(document.querySelector("#x").value),
    y: Number(document.querySelector("#y").value),
    dry_run: dryRun.checked,
  };
}

async function postAction(body) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "action failed");
  }
  await refreshState();
  if (body.action === "screenshot") {
    refreshScreenshot();
  }
}

async function refreshState() {
  const response = await fetch("/api/state");
  const data = await response.json();
  position.textContent = `x: ${data.mouse.x}, y: ${data.mouse.y}`;
  log.textContent = JSON.stringify(data.log, null, 2);
}

function refreshScreenshot() {
  screenshot.src = `/api/latest-screenshot?t=${Date.now()}`;
}

document.querySelector("#refresh").addEventListener("click", async () => {
  await postAction({ action: "screenshot", dry_run: false });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      const action = button.dataset.action;
      const body = action === "screenshot" ? { action, dry_run: false } : payload(action);
      await postAction(body);
    } catch (error) {
      alert(error.message);
    }
  });
});

document.querySelector("#type").addEventListener("click", async () => {
  try {
    await postAction({
      action: "type",
      text: document.querySelector("#text").value,
      dry_run: dryRun.checked,
    });
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#hotkey").addEventListener("click", async () => {
  try {
    await postAction({
      action: "hotkey",
      keys: document
        .querySelector("#keys")
        .value.split(",")
        .map((key) => key.trim())
        .filter(Boolean),
      dry_run: dryRun.checked,
    });
  } catch (error) {
    alert(error.message);
  }
});

screenshot.addEventListener("click", (event) => {
  const rect = screenshot.getBoundingClientRect();
  const imageRatio = screenshot.naturalWidth / screenshot.naturalHeight;
  const boxRatio = rect.width / rect.height;
  const renderedWidth = boxRatio > imageRatio ? rect.height * imageRatio : rect.width;
  const renderedHeight = boxRatio > imageRatio ? rect.height : rect.width / imageRatio;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const localX = event.clientX - rect.left - offsetX;
  const localY = event.clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX > renderedWidth || localY > renderedHeight) {
    return;
  }
  const x = Math.round((localX / renderedWidth) * screenshot.naturalWidth);
  const y = Math.round((localY / renderedHeight) * screenshot.naturalHeight);
  document.querySelector("#x").value = x;
  document.querySelector("#y").value = y;
});

setInterval(refreshState, 1000);
refreshScreenshot();
refreshState();
