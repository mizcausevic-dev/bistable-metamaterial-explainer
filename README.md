# Bistable cell array

A 34-second interactive explainer of conceptual elastic bistability. Four rows of curved cells sit in series under a guided platen. The same precomputed reduced-order trajectory drives the geometry, the force chart, and the energy readouts.

Evidence level: illustrative reduced-order model. Not experimental validation, finite-element verification, material calibration, or an impact test.

The page does not collect personal data. Playback preferences stay in `localStorage` under `bistable-reduced-motion`.

## Setup

```bash
npm install
npm run validate
npm run dev
```

`npm run validate` integrates the model and writes `model-validation-Cursor.md`. `npm run build` typechecks and writes `dist/`. `npm run preview` serves that build at `http://127.0.0.1:4173`.

Audio starts only after Play, Replay, or Play explainer. Space or K toggles playback. Arrows seek. M mutes. F toggles fullscreen. R replays. Keys 1–5 jump to shots.

## What the checks showed

The last `npm run validate` run passed 17 checks, including:

- Unloaded equilibria at q = 0 and q = 1 for each row, with U(1) > U(0), positive curvature at both minima, and a barrier above both.
- A coupled State A and State B equilibrium with a positive Hessian under the allowed row and connector motions.
- Sequential barrier crossings at 15.15, 18.28, 22.70, and 23.38 seconds.
- Zero external force at the shortened end state. Final specimen compression 1.2836. Platen height 2.900, above the State B array height 2.720.
- An open force path from (0, 0) to about (1.28, 0). The path is not closed and is not reported as dissipated energy.
- Main-array energy residual at the numerical noise floor. End work 2.3833, elastic 0.2967, dissipated 2.0866, kinetic 0.
- A separate reset cell. Trigger work about 0.102. Released elastic energy about 0.035. Those are not the same quantity.

Regenerate the report rather than treating this README as a second source of record. The numbers above are copied from the passing run that wrote `model-validation-Cursor.md` after the final drawing amplitude `AMP_B = -0.2`.

## Approximations

- One coordinate per row. The three cells drawn in a row share it.
- Beam shape is a clamped kinematic map. Arc length is not a beam-element constraint. State B bows inward without meeting, so the drawing does not form a pin.
- Contact is a smooth unilateral penalty. After the force reaches zero the platen lifts clear by a fixed gap.
- A quartic wall for q > 1 leaves both minima and the barrier unchanged. It stops an already-switched row from collapsing while later rows are still compressed.
- Viscous terms are illustrative material damping, not a calibrated polymer model.
- The force chart stroke is a centered display average spanning about 0.4 seconds. The numeric actuator force is the instantaneous sample.
- Visible snap timing is the timing of this nondimensional trajectory, not a laboratory switching time.
- No friction, plasticity, fracture, latch, or magnet is in the model.

## Publication

Vite `base` is `./`, so built assets resolve on a GitHub project site. The preview is the `gh-pages` branch, served from the repository root, with `.nojekyll` so the underscore paths in the Vite build are kept. That is GitHub Pages from a branch, not an Actions deploy.

Intended repository, once the push is authenticated: `mizcausevic-dev/bistable-metamaterial-explainer`. The repository did not exist when this was checked. Intended preview, only after Pages reports a site: `https://mizcausevic-dev.github.io/bistable-metamaterial-explainer/`.

This file does not claim that the push or the preview has succeeded.
