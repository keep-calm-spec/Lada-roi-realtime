# Demask ROI Lada

[English](README.md) | 简体中文

Lada ROI Realtime 是一款 Windows 实时 ROI 马赛克修复浮层，
基于 Lada BasicVSR++，使用 NVIDIA CUDA 在本地处理视频画面。

软件基于屏幕捕获工作，不依赖浏览器DOM结构或网页播放器的具体实现。
视频无需提前下载，可以直接观看网页中的兼容视频（包括 JAV），并进行实时处理。

> [!IMPORTANT]
> 模型生成的是基于画面内容的合理重建结果，并不能恢复原始像素。请仅处理
> 你有权使用的媒体内容。

## 功能特点

- 覆盖整个屏幕、鼠标可穿透的 ROI 浮层
- 256×256 RGB 模型输入和输出
- 五帧时序历史
- 使用 CUDA Graph 的 PyTorch CUDA FP16 推理
- 英文状态与性能信息显示
- 完全本地处理，不会上传任何画面

## 系统要求

- 64 位 Windows 10 或 Windows 11
- 支持 CUDA 的 NVIDIA GPU
- 兼容 CUDA 12.6 的 NVIDIA 驱动
- Node.js LTS 和 npm
- 用于管理 Python 环境的 [uv](https://docs.astral.sh/uv/)
- 准备环境和打包完整 CUDA 运行库时，至少需要 15 GiB 可用空间

本项目已在配备 6 GiB 显存的 NVIDIA GeForce RTX 2060 上完成测试。

## 下载便携版

可以从 Google Drive 下载已经打包好的 Windows 版本：

[下载 Demask ROI 1.1.1 便携版](https://drive.google.com/file/d/1ZcgaqtrlxZW-xtvB92efo9zSdFoL9eYk/view?usp=drive_link)

SHA-256：

```text
1c0bde55db6b1c228e0384b2911116bb631e58e6e018fd50392e7bc0e4fd03e5
```

便携版已经包含推理进程、模型、PyTorch、CUDA 运行库和 cuDNN，无需另外
安装 Python 或 CUDA Toolkit，但仍然需要兼容的 NVIDIA 驱动。

## 从源码快速启动

运行：

```text
setup-dev.cmd
start-roi.cmd
```

`setup-dev.cmd` 会自动完成可复现的本地环境配置：

1. 使用 uv 安装项目本地的 Python 3.12 运行环境。
2. 创建 `.venv-lada`。
3. 安装 PyTorch 2.8.0 CUDA 12.6 和推理进程所需的依赖。
4. 使用 `npm ci` 安装锁定版本的 Electron 依赖。
5. 下载官方 Lada 模型并验证其 SHA-256 校验值。

Python 运行环境和软件包缓存都会保存在项目目录内。因此，将仓库放在其他
磁盘上时，大型开发依赖也不会占用系统盘空间。

## 模型权重

模型权重不会提交到 Git 仓库。运行以下脚本下载所需权重：

```text
download-model.cmd
```

脚本会下载：

```text
models/lada_mosaic_restoration_model_generic_v1.2.pth
```

预期 SHA-256：

```text
d404152576ce64fb5b2f315c03062709dac4f5f8548934866cd01c823c8104ee
```

模型来源为官方
[ladaapp/lada Hugging Face 仓库](https://huggingface.co/ladaapp/lada)。

## 快捷键

- `Ctrl+R`：开启或关闭 ROI
- `Ctrl+=`：放大 ROI
- `Ctrl+-`：缩小 ROI
- `Ctrl+Q`：退出

软件运行期间，这些快捷键为全局快捷键，会覆盖前台应用中的相同按键组合。

## 构建便携版

运行：

```text
build-portable.cmd
```

构建过程分为两个阶段：

1. PyInstaller 在 `worker-dist` 中生成独立的 CUDA 推理进程。
2. electron-builder 将 Electron、推理进程和模型打包为
   `dist/Demask-ROI-<version>-portable.exe`。

便携版可执行文件约为 1.6 GiB，因为其中包含 PyTorch、CUDA 和 cuDNN。
目标电脑无需安装 Python 或 CUDA Toolkit，但仍需安装兼容的 NVIDIA 驱动。

如需让便携版的临时解压文件保留在项目所在磁盘，请通过以下脚本启动：

```text
start-portable.cmd
```

## 处理流程

1. Electron 捕获主显示器画面。
2. 透明窗口跟随鼠标指针移动，但不会拦截鼠标输入。
3. ROI 被缩放为 256×256 RGB 图像，并通过二进制 IPC 发送。
4. Lada 推理进程维护一个五帧滑动窗口。
5. BasicVSR++ 通过已经捕获的 CUDA Graph 执行推理。
6. 最新的修复帧返回浮层并显示。

前四帧用于填充时序历史，从第五帧开始显示修复结果。鼠标大幅移动或改变
ROI 尺寸时，时序历史会被重置。

受 DRM 保护的内容通过 Windows 屏幕捕获 API 获取时可能显示为黑屏。

## 仓库结构

```text
desktop/                 Electron 主进程、预加载脚本、渲染进程和界面
python/lada_worker.py    二进制 IPC 与 CUDA 推理进程
scripts/                 可复现的模型下载工具
vendor/lada/             固定到指定上游提交的 Lada 源码
models/                  本地模型权重，不纳入 Git
requirements-worker.txt  Python 推理进程的直接依赖
setup-dev.cmd            可复现的 Windows 开发环境配置脚本
build-portable.cmd       Windows 便携版构建入口
```

生成的运行环境、模型权重、构建结果、可执行文件和缓存均已通过 `.gitignore`
排除。便携版可执行文件应作为 GitHub Release 附件发布，而不是直接提交到
源码仓库。

## 支持项目

如果这个项目对你有帮助，可以通过以下 ETH 钱包地址支持项目继续开发：

```text
0x50a85a684ed4e5abb9e57c823acf72a9c21f79d7
```

转账前请仔细核对钱包地址和所选网络。区块链交易一旦发出便无法撤销。

## 上游项目与许可证

本项目内置的 Lada 源码来自
[`ladaapp/lada`](https://github.com/ladaapp/lada)，固定于提交
`20cb34a20a83c72c87a991d2c949032c70085b16`。

本项目采用 GNU Affero General Public License v3.0 许可证。详情请参阅
[LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
