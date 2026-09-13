# Design QA · Layered premium roulette motion

Source visual truth: `prototypes/premium-roulette-assets/target-composite.png`

Reference source: `C:/Users/Matu/AppData/Local/Temp/codex-clipboard-0cc3213a-cbcf-4fbd-88fb-7a6d4e2564ec.png`

Implementation: `http://127.0.0.1:5181/`

Implementation screenshots:

- `prototypes/premium-roulette/qa/motion-spin-mid-390x844.png`
- `prototypes/premium-roulette/qa/motion-result-390x844.png`

## Normalization

- Target composite: 1080 × 1920 portrait pixels.
- Implementation captures: 390 × 844 pixels at a 390 × 844 CSS viewport,
  device pixel ratio 1.
- State: idle, mid-spin, and post-spin result moment.
- The target composite remains visual reference only and is not rendered by the
  implementation.

## Motion evidence and findings

- Only `.wheel-face` receives the rotation transform. Frame, inner depth, hub,
  pointer, pedestal, shadow, and foliage keep their own fixed positions.
- Spin duration is 4.8 seconds with five full rotations, local random segment
  selection, and eased deceleration to an exact 60° phase.
- Pointer tick feedback is triggered as segment boundaries pass the pointer.
- The center button presses, disables during motion, shows `GIRO…`, then
  restores `GIRAR` after the result moment.
- Result feedback uses a short face glow, brass sweep, and object pulse with no
  modal or confetti.

No actionable P0, P1, or P2 findings remain for this isolated visual-motion
pass.

Accepted P3 differences:

- The live wheel face uses flat six-color segments and placeholder glyph icons;
  the composite has baked material texture and richer prize icon artwork.
- The existing `roulette-base.png` is a compact horizontal plinth, while the
  target composite shows a more architectural triangular support.
- Foreground foliage is reused/mirrored from the available transparent asset;
  it is intentionally cropped and animated rather than shown as a complete
  plant.

## Browser checks

- Chrome at exactly 390 × 844: passed.
- Ten consecutive spins completed; every spin returned `GIRAR` and stopped at
  a segment phase with measured alignment error below `0.001°`.
- During each sampled spin, the button was disabled, the label was `GIRO…`,
  the spin state was active, and pointer tick feedback was observed.
- Repeated input is guarded by both the disabled button and `isSpinning` state.
- Final `scrollWidth === clientWidth === 390` and
  `scrollHeight === clientHeight === 844`.
- All image layers loaded successfully; `target-composite.png` is not in the
  DOM.
- Chrome logs contained only Vite connection/update debug messages; no errors.
- No CRM, runtime, API, database, analytics, permissions, or publishing code
  is imported.

## Fidelity surfaces

- Typography: existing minimal centered Corsteno label, instruction, and
  `GIRAR` treatment remain unchanged; `GIRO…` is restrained during motion.
- Spacing/layout: face rotation is isolated inside the shared wheel container;
  outer alignment and foreground crop remain stable.
- Colors: dark warm botanical background, walnut, forest green, and aged brass
  palette remain unchanged; spin adds only a restrained warm highlight.
- Image quality: existing transparent PNG layers are reused without creating
  or regenerating assets.
- Copy/content: only the existing prototype copy plus the temporary visual-only
  result status is shown.

## Comparison history

1. Static composition pass: established the current layered roulette and
   foreground foliage at 390 × 844 with no overflow.
2. Motion pass: initial live spin verified that only the dynamic face rotated;
   the button state and pointer ticks were added without layer drift.
3. Regression pass: ten spins verified exact segment settling, disabled input,
   fixed decorative layers, result feedback, and stable viewport bounds.

final result: passed
