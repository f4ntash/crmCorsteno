# Listón Roble Natural — Surface Material Assets

These files are the local 2K PBR maps for the Revestimientos 3D demo. They are
kept separate from the catalog thumbnail (`511.svg`) and are loaded by URL at
runtime; they are not part of the JavaScript bundle.

- `basecolor.webp` — 2048 × 2048 RGB, sRGB, 556 KB.
- `normal.webp` — 2048 × 2048 RGB, tangent-space OpenGL normal, linear/no color space, 4.42 MB lossless WebP.
- `roughness.webp` — 2048 × 2048 grayscale, linear/no color space, 1.50 MB lossless WebP.

The source material is [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks)
by Dimitrios Savva, downloaded from Poly Haven's 2K maps and converted locally
to WebP. Poly Haven states that its assets are licensed CC0 on its
[license page](https://polyhaven.com/license). The configured physical repeat
is an intentionally editable demo calibration of 0.16 m × 2.40 m for the full
texture area represented by one repeat, with 90° UV rotation for vertical
orientation.
