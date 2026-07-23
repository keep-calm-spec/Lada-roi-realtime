# Third-party notices

Demask ROI Lada uses the following open-source components:

- Lada source code and `lada_mosaic_restoration_model_generic_v1.2.pth`,
  Copyright Lada Authors, licensed under AGPL-3.0. The corresponding source is
  included under `vendor/lada` at upstream commit
  `20cb34a20a83c72c87a991d2c949032c70085b16`. The upstream project is
  <https://github.com/ladaapp/lada>.
- PyTorch and torchvision, licensed under BSD-style licenses.
- Electron, licensed under MIT.

The Lada model generates a plausible restoration. It cannot recover pixels
that were irreversibly removed by the original mosaic operation.
