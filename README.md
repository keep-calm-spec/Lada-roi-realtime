# Lada ROI Realtime — Demask ROI Lada

Other languages:
[简体中文](https://github.com/keep-calm-spec/Lada-roi-realtime/blob/main/README.zh-CN.md) |
[日本語](https://github.com/keep-calm-spec/Lada-roi-realtime/blob/main/README.ja.md)

Lada ROI Realtime is a real-time Windows ROI overlay for
Lada-based JAV video mosaic restoration using NVIDIA CUDA.

The overlay works at the screen-capture level, so it is independent of browser
DOM structure and video-player implementation. Videos do not need to be
downloaded first: compatible web video playback, including JAV, can be viewed
and processed in real time.

## Demo

![Lada ROI Realtime Demo](./test.gif)

> [!IMPORTANT]
> Model output is a plausible reconstruction, not recovery of the original
> pixels. Use the software only on media you are authorized to process.

## Features

- Screen-wide, click-through ROI overlay
- 256×256 RGB model input and output
- Five-frame temporal history
- PyTorch CUDA FP16 inference with CUDA Graph
- English status and performance display
- Fully local processing; frames are not uploaded

## Requirements

- Windows 10 or Windows 11, 64-bit
- CUDA-capable NVIDIA GPU
- NVIDIA driver compatible with CUDA 12.6
- Node.js LTS and npm
- [uv](https://docs.astral.sh/uv/) for Python environment management
- At least 15 GiB free while preparing and packaging the full CUDA runtime

The tested system uses an NVIDIA GeForce RTX 2060 with 6 GiB VRAM.

### Tested local configuration

- OS: Windows 11 Pro, 64-bit (build 26200)
- CPU: AMD Ryzen 7 3700X (8 cores, 16 threads)
- Memory: 32 GiB
- GPU: NVIDIA GeForce RTX 2060 with 6 GiB VRAM
- GPU compute capability: 7.5
- NVIDIA driver: 591.86
- PyTorch: 2.8.0+cu126
- CUDA runtime: 12.6


## Quick start from source

Run:

download Lada and move the main projects to ./vendor (https://github.com/ladaapp/lada)

```text
setup-dev.cmd
start-roi.cmd
```

`setup-dev.cmd` performs the reproducible local setup:

1. Installs a project-local Python 3.12 runtime with uv.
2. Creates `.venv-lada`.
3. Installs PyTorch 2.8.0 CUDA 12.6 and worker dependencies.
4. Installs the locked Electron dependencies with `npm ci`.
5. Downloads the official Lada model and verifies its SHA-256 checksum.

The Python runtime and package caches are stored inside this project directory,
so placing the repository on another drive keeps the large development
dependencies off the system drive.

## Model weight

Model weights are deliberately excluded from Git. Download the required weight
with:

```text
download-model.cmd
```

The script downloads:

```text
models/lada_mosaic_restoration_model_generic_v1.2.pth
```

Expected SHA-256:

```text
70FDA0BDDDEA22CBA1656B9095542470D8F00E080F8196B05F28A4250A32616E
```

The source URL is the official
[ladaapp/lada Hugging Face repository](https://huggingface.co/ladaapp/lada).

## Shortcuts

- `Ctrl+R`: toggle the ROI
- `Ctrl+=`: enlarge the ROI
- `Ctrl+-`: shrink the ROI
- `Ctrl+Q`: quit

The shortcuts are global while the application is running and override
identical shortcuts in the foreground application.

## Build the portable application

Run:

```text
build-portable.cmd
```

The build has two stages:

1. PyInstaller creates a standalone CUDA inference worker in `worker-dist`.
2. electron-builder packages Electron, the worker, and the model into
   `dist/Demask-ROI-<version>-portable.exe`.

The portable executable is approximately 1.6 GiB because it includes PyTorch,
CUDA, and cuDNN. The target computer does not need Python or the CUDA Toolkit,
but it still needs a compatible NVIDIA driver.

To keep the portable application's temporary extraction on the same drive as
the repository, launch it through:

```text
start-portable.cmd
```

## Processing flow

1. Electron captures the primary display.
2. The transparent window tracks the pointer without consuming mouse input.
3. The ROI is resized to 256×256 RGB and sent over binary IPC.
4. The Lada worker maintains a five-frame sliding window.
5. BasicVSR++ runs through a captured CUDA Graph.
6. The latest restored frame is returned and rendered in the overlay.

The first four frames fill the temporal history. Restored output begins on the
fifth frame. Large pointer movements and ROI-size changes reset the history.

DRM-protected content may appear black through the Windows screen-capture API.

## Download the portable application

A ready-to-run Windows build is available from Google Drive:

[Download Demask ROI 1.1.1 portable](https://drive.google.com/file/d/1ZcgaqtrlxZW-xtvB92efo9zSdFoL9eYk/view?usp=drive_link)

SHA-256:

```text
1c0bde55db6b1c228e0384b2911116bb631e58e6e018fd50392e7bc0e4fd03e5
```

The portable build includes the inference worker, model, PyTorch, CUDA runtime,
and cuDNN. It does not require a Python installation or the CUDA Toolkit, but a
compatible NVIDIA driver is still required.

## Repository layout

```text
desktop/                 Electron main, preload, renderer, and UI
python/lada_worker.py    Binary IPC and CUDA inference worker
scripts/                 Reproducible model download tooling
vendor/lada/             Vendored Lada source at a pinned upstream commit
models/                  Local model weights; ignored by Git
requirements-worker.txt  Direct Python worker dependencies
setup-dev.cmd            Reproducible Windows development setup
build-portable.cmd       Windows portable build entry point
```

Generated environments, model weights, build outputs, executables, and caches
are excluded by `.gitignore`. Publish the portable executable as a GitHub
Release asset rather than committing it to the source repository.

## Upstream and license

The Lada source is vendored from
[`ladaapp/lada`](https://github.com/ladaapp/lada) at commit
`20cb34a20a83c72c87a991d2c949032c70085b16`.

This project is licensed under the GNU Affero General Public License v3.0.
See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

If this project is useful to you, you can support its continued development
through the following EVM-compatible wallet address (Ethereum address):

```text
0x50a85a684ed4e5abb9e57c823acf72a9c21f79d7
```
