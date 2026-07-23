const MODEL_INPUT_SIZE = 256;
const HISTORY_FRAMES = 5;

const screenSource = document.querySelector("#screenSource");
const roiLens = document.querySelector("#roiLens");
const roiOutput = document.querySelector("#roiOutput");
const outputContext = roiOutput.getContext("2d", {
  alpha: false,
  desynchronized: true,
});
const hud = document.querySelector("#hud");
const statusText = document.querySelector("#statusText");
const metrics = document.querySelector("#metrics");

const inputBuffer = document.createElement("canvas");
inputBuffer.width = MODEL_INPUT_SIZE;
inputBuffer.height = MODEL_INPUT_SIZE;
const inputContext = inputBuffer.getContext("2d", {
  alpha: false,
  willReadFrequently: true,
});

roiOutput.width = MODEL_INPUT_SIZE;
roiOutput.height = MODEL_INPUT_SIZE;

let modelMetadata = null;
let active = true;
let modelReady = false;
let captureReady = false;
let inferenceBusy = false;
let frameCallbackId = null;
let pointer = null;
let roiSize = 224;
let skippedFrames = 0;
let fpsFrames = 0;
let fpsStartedAt = performance.now();
let currentFps = 0;
let resetHistory = true;
let lastSample = null;

window.addEventListener("mousemove", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  updateLensBounds();
});

window.addEventListener("resize", () => {
  resetHistory = true;
  updateLensBounds();
});

window.desktopRoi.onActiveChange((nextActive) => {
  active = Boolean(nextActive);
  resetHistory = true;
  lastSample = null;
  if (!active) {
    roiLens.hidden = true;
    stopFrameLoop();
  } else if (modelReady && captureReady) {
    updateLensBounds();
    startFrameLoop();
  }
});

window.desktopRoi.onResize((delta) => {
  roiSize = clamp(roiSize + Number(delta), 96, 480);
  resetHistory = true;
  lastSample = null;
  updateLensBounds();
});

async function initializeModel() {
  modelMetadata = await window.desktopRoi.waitForModel();
  if (
    modelMetadata.frameSize !== MODEL_INPUT_SIZE ||
    modelMetadata.historyFrames !== HISTORY_FRAMES
  ) {
    throw new Error("The Lada worker and UI versions do not match");
  }
  modelReady = true;
}

async function initializeCapture() {
  const source = await window.desktopRoi.getPrimaryScreen();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: source.id,
        maxFrameRate: 30,
      },
    },
  });

  const [track] = stream.getVideoTracks();
  track.addEventListener("ended", () => {
    captureReady = false;
    stopFrameLoop();
    showError("Screen capture stopped. Please restart the application.");
  });

  screenSource.srcObject = stream;
  await screenSource.play();
  await waitForVideoDimensions();
  captureReady = true;
}

function waitForVideoDimensions() {
  if (screenSource.videoWidth && screenSource.videoHeight) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    screenSource.addEventListener("loadedmetadata", resolve, { once: true });
  });
}

function startFrameLoop() {
  if (
    frameCallbackId !== null ||
    !active ||
    !modelReady ||
    !captureReady ||
    !("requestVideoFrameCallback" in HTMLVideoElement.prototype)
  ) {
    return;
  }

  const onFrame = (now, frameMetadata) => {
    frameCallbackId = null;
    if (active && pointer) {
      if (inferenceBusy) {
        skippedFrames += 1;
      } else {
        void processFrame(now, frameMetadata);
      }
    }
    if (active && captureReady) {
      frameCallbackId = screenSource.requestVideoFrameCallback(onFrame);
    }
  };

  frameCallbackId = screenSource.requestVideoFrameCallback(onFrame);
}

function stopFrameLoop() {
  if (frameCallbackId === null) return;
  screenSource.cancelVideoFrameCallback(frameCallbackId);
  frameCallbackId = null;
}

async function processFrame(now, frameMetadata) {
  if (!pointer || inferenceBusy) return;
  inferenceBusy = true;
  const startedAt = performance.now();

  try {
    const displayLeft = clamp(pointer.x - roiSize / 2, 0, innerWidth - roiSize);
    const displayTop = clamp(pointer.y - roiSize / 2, 0, innerHeight - roiSize);
    const scaleX = screenSource.videoWidth / innerWidth;
    const scaleY = screenSource.videoHeight / innerHeight;
    const sourceX = Math.round(displayLeft * scaleX);
    const sourceY = Math.round(displayTop * scaleY);
    const sourceWidth = Math.max(1, Math.round(roiSize * scaleX));
    const sourceHeight = Math.max(1, Math.round(roiSize * scaleY));

    inputContext.imageSmoothingEnabled = true;
    inputContext.imageSmoothingQuality = "high";
    inputContext.drawImage(
      screenSource,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    );

    const imageData = inputContext.getImageData(
      0,
      0,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    );
    const rgbPixels = rgbaToRgb(imageData.data);
    const movedTooFar = shouldResetForMotion(displayLeft, displayTop);
    const shouldReset = resetHistory || movedTooFar;
    resetHistory = false;
    lastSample = { x: displayLeft, y: displayTop, size: roiSize };

    const response = await window.desktopRoi.inferFrame(
      rgbPixels,
      shouldReset,
    );
    const inferredAt = performance.now();
    if (!active) return;

    outputContext.putImageData(
      rgbToImageData(response.pixels, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE),
      0,
      0,
    );
    const finishedAt = performance.now();

    fpsFrames += 1;
    const fpsElapsed = now - fpsStartedAt;
    if (fpsElapsed >= 500) {
      currentFps = (fpsFrames * 1000) / fpsElapsed;
      fpsFrames = 0;
      fpsStartedAt = now;
    }

    const totalMs = finishedAt - startedAt;
    const frameAge = Math.max(
      0,
      finishedAt - (frameMetadata.expectedDisplayTime ?? startedAt),
    );
    const buffering = response.bufferedFrames < HISTORY_FRAMES;
    metrics.textContent = buffering
      ? `Temporal buffer ${response.bufferedFrames}/${HISTORY_FRAMES} · ${totalMs.toFixed(1)} ms`
      : `${currentFps.toFixed(1)} FPS · Lada ${response.inferenceMs.toFixed(1)} ms · ` +
        `total ${totalMs.toFixed(1)} ms · skipped ${skippedFrames} · latency ${frameAge.toFixed(1)} ms`;
  } catch (error) {
    console.error("ROI inference failed:", error);
    showError(`ROI inference failed: ${formatError(error)}`);
  } finally {
    inferenceBusy = false;
  }
}

function shouldResetForMotion(left, top) {
  if (!lastSample || lastSample.size !== roiSize) return true;
  const distance = Math.hypot(left - lastSample.x, top - lastSample.y);
  return distance > Math.max(48, roiSize * 0.25);
}

function updateLensBounds() {
  if (!active || !pointer || !modelReady || !captureReady) {
    roiLens.hidden = true;
    return;
  }

  const width = Math.min(roiSize, innerWidth);
  const height = Math.min(roiSize, innerHeight);
  const left = clamp(pointer.x - width / 2, 0, innerWidth - width);
  const top = clamp(pointer.y - height / 2, 0, innerHeight - height);

  roiLens.style.left = `${left}px`;
  roiLens.style.top = `${top}px`;
  roiLens.style.width = `${width}px`;
  roiLens.style.height = `${height}px`;
  roiLens.hidden = false;
}

function rgbaToRgb(rgba) {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source];
    rgb[target++] = rgba[source + 1];
    rgb[target++] = rgba[source + 2];
  }
  return rgb;
}

function rgbToImageData(rgb, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3) {
    rgba[target++] = rgb[source];
    rgba[target++] = rgb[source + 1];
    rgba[target++] = rgb[source + 2];
    rgba[target++] = 255;
  }
  return new ImageData(rgba, width, height);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function showError(message) {
  hud.dataset.state = "error";
  statusText.textContent = message;
  roiLens.hidden = true;
  window.desktopRoi.reportStatus({ state: "error", message });
}

async function start() {
  try {
    await Promise.all([initializeModel(), initializeCapture()]);
    hud.dataset.state = "ready";
    statusText.textContent =
      `${modelMetadata.model} / ${modelMetadata.provider} / screen ROI enabled`;
    metrics.textContent = "Move the pointer to begin processing";
    window.desktopRoi.reportStatus({
      state: "ready",
      message: `${modelMetadata.model} / ${modelMetadata.device} ready`,
    });
    updateLensBounds();
    startFrameLoop();
  } catch (error) {
    console.error("Desktop ROI initialization failed:", error);
    showError(`Startup failed: ${formatError(error)}`);
  }
}

void start();
