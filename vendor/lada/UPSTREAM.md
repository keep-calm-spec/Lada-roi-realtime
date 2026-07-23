# Vendored Lada source

This directory contains the Lada source required by the ROI inference worker.

- Upstream: <https://github.com/ladaapp/lada>
- Vendored commit: `20cb34a20a83c72c87a991d2c949032c70085b16`
- License: AGPL-3.0; see `LICENSE.md`

The model weight is not stored in this repository. Run
`download-model.cmd` from the project root to download the official weight and
verify its SHA-256 checksum.
