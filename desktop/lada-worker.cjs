const { spawn } = require("node:child_process");
const path = require("node:path");

const FRAME_SIZE = 256;
const FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * 3;
const REQUEST_HEADER_BYTES = 8;
const RESPONSE_HEADER_BYTES = 12;

class LadaWorker {
  constructor({ app, logger = console }) {
    this.app = app;
    this.logger = logger;
    this.process = null;
    this.stdoutBuffer = Buffer.alloc(0);
    this.stderrBuffer = "";
    this.pending = [];
    this.metadata = null;
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
  }

  start() {
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    const appRoot = path.resolve(this.app.getAppPath());
    const modelPath = this.app.isPackaged
      ? path.join(
          process.resourcesPath,
          "models",
          "lada_mosaic_restoration_model_generic_v1.2.pth",
        )
      : path.join(
          appRoot,
          "models",
          "lada_mosaic_restoration_model_generic_v1.2.pth",
        );

    let command;
    let args;
    const env = { ...process.env, PYTHONUNBUFFERED: "1" };
    if (this.app.isPackaged) {
      command = path.join(
        process.resourcesPath,
        "lada-worker",
        "lada-worker.exe",
      );
      args = ["--model", modelPath];
    } else {
      command = path.join(appRoot, ".venv-lada", "Scripts", "python.exe");
      args = [
        path.join(appRoot, "python", "lada_worker.py"),
        "--model",
        modelPath,
      ];
      env.PYTHONPATH = path.join(appRoot, "vendor", "lada");
    }

    // In a packaged Electron app, app.getAppPath() points at app.asar, which
    // is a file rather than a valid process working directory. Windows reports
    // spawn ENOENT when cwd is invalid even if the executable itself exists.
    const workerCwd = this.app.isPackaged ? path.dirname(command) : appRoot;
    this.process = spawn(command, args, {
      cwd: workerCwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process.stdout.on("data", (chunk) => this.#consumeStdout(chunk));
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => this.#consumeStderr(chunk));
    this.process.on("error", (error) => this.#fail(error));
    this.process.on("exit", (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `code ${code}`;
      this.#fail(new Error(`Lada worker exited with ${suffix}`));
    });

    const startupTimer = setTimeout(() => {
      this.#fail(new Error("Lada model startup timed out"));
    }, 90_000);
    this.readyPromise.then(
      () => clearTimeout(startupTimer),
      () => clearTimeout(startupTimer),
    );
    return this.readyPromise;
  }

  async waitUntilReady() {
    return this.start();
  }

  async infer(rgbPixels, resetHistory = false) {
    await this.waitUntilReady();
    if (!this.process || this.process.killed) {
      throw new Error("Lada worker is not running");
    }

    const payload = Buffer.from(rgbPixels);
    if (payload.length !== FRAME_BYTES) {
      throw new Error(
        `Invalid RGB frame size ${payload.length}; expected ${FRAME_BYTES}`,
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Lada frame inference timed out"));
      }, 15_000);
      this.pending.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      const header = Buffer.allocUnsafe(REQUEST_HEADER_BYTES);
      header.writeUInt32LE(payload.length, 0);
      header.writeUInt32LE(resetHistory ? 1 : 0, 4);
      this.process.stdin.write(header);
      this.process.stdin.write(payload);
    });
  }

  stop() {
    if (!this.process || this.process.killed) return;
    this.process.stdin.end();
    const child = this.process;
    setTimeout(() => {
      if (!child.killed) child.kill();
    }, 1_000).unref();
  }

  #consumeStdout(chunk) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);

    while (this.stdoutBuffer.length >= RESPONSE_HEADER_BYTES) {
      const payloadLength = this.stdoutBuffer.readUInt32LE(0);
      const messageLength = RESPONSE_HEADER_BYTES + payloadLength;
      if (this.stdoutBuffer.length < messageLength) return;

      const inferenceMs = this.stdoutBuffer.readFloatLE(4);
      const bufferedFrames = this.stdoutBuffer.readUInt32LE(8);
      const payload = this.stdoutBuffer.subarray(
        RESPONSE_HEADER_BYTES,
        messageLength,
      );
      this.stdoutBuffer = this.stdoutBuffer.subarray(messageLength);

      const request = this.pending.shift();
      if (!request) {
        this.logger.warn("[Demask ROI] Unexpected Lada worker response");
        continue;
      }
      if (payloadLength === 0 || inferenceMs < 0) {
        request.reject(new Error("Lada inference failed; see worker log"));
      } else {
        request.resolve({
          pixels: new Uint8Array(payload),
          inferenceMs,
          bufferedFrames,
        });
      }
    }
  }

  #consumeStderr(chunk) {
    this.stderrBuffer += chunk;
    const lines = this.stderrBuffer.split(/\r?\n/);
    this.stderrBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("READY\t")) {
        try {
          this.metadata = JSON.parse(line.slice(6));
          this.resolveReady?.(this.metadata);
        } catch (error) {
          this.#fail(new Error(`Invalid Lada READY message: ${error.message}`));
        }
      } else {
        this.logger.log(`[Lada] ${line}`);
      }
    }
  }

  #fail(error) {
    if (!this.metadata) this.rejectReady?.(error);
    while (this.pending.length) {
      this.pending.shift().reject(error);
    }
  }
}

module.exports = { FRAME_SIZE, LadaWorker };
