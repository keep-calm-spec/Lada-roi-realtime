# Contributing

Contributions are welcome through issues and pull requests.

## Development

1. Install Node.js LTS and [uv](https://docs.astral.sh/uv/).
2. Run `setup-dev.cmd`.
3. Run `start-roi.cmd`.
4. Keep model weights, virtual environments, packaged executables, and generated worker files out of Git.

Before submitting a change, run:

```text
node --check desktop/main.cjs
node --check desktop/preload.cjs
node --check desktop/renderer.js
node --check desktop/lada-worker.cjs
.venv-lada\Scripts\python.exe -m py_compile python\lada_worker.py
```

Do not remove or alter third-party copyright and license notices. Changes that
distribute modified binaries must continue to satisfy AGPL-3.0 source
availability requirements.
