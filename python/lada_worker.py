"""Binary stdin/stdout worker for Lada BasicVSR++ ROI inference.

The Lada source and model are licensed under AGPL-3.0. This worker only
adapts the public inference model to the desktop ROI application's IPC.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
import traceback
from collections import deque
from pathlib import Path

import numpy as np
import torch
from mmengine.runner import load_checkpoint

from lada.models.basicvsrpp.mmagic import register_all_modules


FRAME_SIZE = 256
FRAME_CHANNELS = 3
FRAME_BYTES = FRAME_SIZE * FRAME_SIZE * FRAME_CHANNELS
HISTORY_FRAMES = 5
REQUEST_HEADER = struct.Struct("<II")
RESPONSE_HEADER = struct.Struct("<IfI")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    return parser.parse_args()


def read_exact(stream, size: int) -> bytes | None:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            return None
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def build_model(model_path: Path) -> torch.nn.Module:
    # Importing Lada's full registry also imports the video/dataset stack. The
    # ROI worker only needs the model registry, so register that subset here.
    register_all_modules()
    from lada.models.basicvsrpp.basicvsrpp_gan import (  # noqa: F401
        BasicVSRPlusPlusGan,
        BasicVSRPlusPlusGanNet,
    )
    from lada.models.basicvsrpp.mmagic.registry import MODELS

    config = dict(
        type="BasicVSRPlusPlusGan",
        generator=dict(
            type="BasicVSRPlusPlusGanNet",
            mid_channels=64,
            num_blocks=15,
            spynet_pretrained=None,
        ),
        pixel_loss=dict(
            type="CharbonnierLoss",
            loss_weight=1.0,
            reduction="mean",
        ),
        is_use_ema=True,
        data_preprocessor=dict(
            type="DataPreprocessor",
            mean=[0.0, 0.0, 0.0],
            std=[255.0, 255.0, 255.0],
        ),
    )

    model = MODELS.build(config)
    load_checkpoint(model, str(model_path), map_location="cpu")
    return model.to("cuda").eval().half()


class LadaGraph:
    def __init__(self, model: torch.nn.Module) -> None:
        self.model = model
        self.frames: deque[torch.Tensor] = deque(maxlen=HISTORY_FRAMES)
        self.static_input = torch.zeros(
            (1, HISTORY_FRAMES, 3, FRAME_SIZE, FRAME_SIZE),
            device="cuda",
            dtype=torch.float16,
        )
        self.static_output: torch.Tensor
        self.graph = torch.cuda.CUDAGraph()
        self._capture()

    def _capture(self) -> None:
        warmup_stream = torch.cuda.Stream()
        warmup_stream.wait_stream(torch.cuda.current_stream())
        with torch.cuda.stream(warmup_stream), torch.inference_mode():
            for _ in range(3):
                self.model(inputs=self.static_input)
        torch.cuda.current_stream().wait_stream(warmup_stream)

        with torch.cuda.graph(self.graph), torch.inference_mode():
            self.static_output = self.model(inputs=self.static_input)
        torch.cuda.synchronize()

    @staticmethod
    def _rgb_bytes_to_bgr_tensor(payload: bytes) -> torch.Tensor:
        rgb = np.frombuffer(payload, dtype=np.uint8).reshape(
            FRAME_SIZE,
            FRAME_SIZE,
            FRAME_CHANNELS,
        )
        tensor = torch.from_numpy(rgb.copy()).to("cuda")
        tensor = tensor.permute(2, 0, 1)[[2, 1, 0]]
        return tensor.to(dtype=torch.float16).div_(255.0)

    def reset(self) -> None:
        self.frames.clear()

    def process(self, payload: bytes, reset: bool) -> tuple[bytes, float, int]:
        if reset:
            self.reset()

        self.frames.append(self._rgb_bytes_to_bgr_tensor(payload))
        buffered = len(self.frames)
        if buffered < HISTORY_FRAMES:
            return payload, 0.0, buffered

        started_at = time.perf_counter()
        self.static_input.copy_(torch.stack(tuple(self.frames)).unsqueeze(0))
        self.graph.replay()

        # Lada operates in BGR order. Convert the newest restored frame back
        # to RGB before returning it to the Electron canvas.
        rgb = (
            self.static_output[0, -1][[2, 1, 0]]
            .clamp_(0.0, 1.0)
            .mul_(255.0)
            .to(torch.uint8)
            .permute(1, 2, 0)
            .contiguous()
            .cpu()
            .numpy()
        )
        elapsed_ms = (time.perf_counter() - started_at) * 1000.0
        return rgb.tobytes(), elapsed_ms, buffered


def send_ready(metadata: dict[str, object]) -> None:
    print(f"READY\t{json.dumps(metadata, ensure_ascii=False)}", flush=True)


def send_response(
    output_stream,
    payload: bytes,
    elapsed_ms: float,
    buffered_frames: int,
) -> None:
    output_stream.write(
        RESPONSE_HEADER.pack(len(payload), elapsed_ms, buffered_frames)
    )
    output_stream.write(payload)
    output_stream.flush()


def main() -> int:
    args = parse_args()
    if not args.model.is_file():
        raise FileNotFoundError(f"Lada model not found: {args.model}")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA-capable NVIDIA GPU not found")

    # Reserve stdout for binary frame responses. Redirect library messages
    # (including mmengine checkpoint logging) to stderr.
    input_stream = sys.stdin.buffer
    output_stream = sys.stdout.buffer
    sys.stdout = sys.stderr

    torch.backends.cudnn.benchmark = True
    torch.set_grad_enabled(False)

    model = build_model(args.model)
    runner = LadaGraph(model)
    properties = torch.cuda.get_device_properties(0)
    send_ready(
        {
            "model": "Lada BasicVSR++ v1.2",
            "provider": "CUDA FP16 + CUDA Graph",
            "device": torch.cuda.get_device_name(0),
            "vramMiB": properties.total_memory // (1024 * 1024),
            "frameSize": FRAME_SIZE,
            "historyFrames": HISTORY_FRAMES,
        }
    )

    while True:
        header = read_exact(input_stream, REQUEST_HEADER.size)
        if header is None:
            break
        payload_length, flags = REQUEST_HEADER.unpack(header)
        if payload_length != FRAME_BYTES:
            raise ValueError(
                f"Invalid RGB frame size: {payload_length}, expected {FRAME_BYTES}"
            )
        payload = read_exact(input_stream, payload_length)
        if payload is None:
            break

        try:
            output, elapsed_ms, buffered = runner.process(
                payload,
                reset=bool(flags & 1),
            )
            send_response(output_stream, output, elapsed_ms, buffered)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            send_response(output_stream, b"", -1.0, len(runner.frames))

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc(file=sys.stderr)
        raise SystemExit(1)
