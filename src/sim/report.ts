import {
  AMP_A,
  AMP_B,
  INITIAL_CLEARANCE,
  BAR_THICKNESS,
  C_NODE,
  C_Q,
  DELTA_H,
  DURATION,
  H_A,
  K_AX,
  K_CONTACT,
  LAMBDAS,
  LIFT_GAP,
  M_NODE,
  M_Q,
  N_ROWS,
  Q_M,
  RESET_C,
  RESET_FORCE_FACTOR,
  RESET_LAMBDA,
  RESET_M,
  RESET_PULSE,
  U,
  analyticGradient,
  coupledHessian,
  criticalResetForce,
  illustrativeArcLength,
  naturalHeight,
  potentialChecks,
  precompute,
  rowRestHeight,
  sampleAt,
  symmetricEigenvalues,
  unloadedState,
  type Trajectory,
} from "./physics.ts";

export type Check = { name: string; ok: boolean; detail: string };

export type ModelReport = {
  checks: Check[];
  ok: boolean;
  trajectory: Trajectory;
  lines: string[];
};

function fmt(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "non-finite";
  return value.toFixed(digits);
}

function gradientNorm(state: number[]): number {
  const g = analyticGradient(state);
  return Math.hypot(...g);
}

export function assess(tr = precompute()): ModelReport {
  const checks: Check[] = [];
  const pass = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const wells = LAMBDAS.map((lambda, index) => ({ index, lambda, ...potentialChecks(lambda) }));
  for (const well of wells) {
    pass(
      `Row ${well.index + 1} unloaded equilibria`,
      Math.abs(well.upA) < 1e-9 &&
        Math.abs(well.upB) < 1e-9 &&
        well.uppA > 0 &&
        well.uppB > 0 &&
        well.uB > well.uA &&
        well.uBarrier > well.uB,
      `U'(0)=${fmt(well.upA, 6)}, U'(1)=${fmt(well.upB, 6)}, U''(0)=${fmt(well.uppA)}, U''(1)=${fmt(well.uppB)}, U(1)-U(0)=${fmt(well.uB - well.uA)}, U(barrier)-U(1)=${fmt(well.uBarrier - well.uB)}`,
    );
  }

  for (const [label, qValue] of [
    ["State A", 0],
    ["State B", 1],
  ] as const) {
    const state = unloadedState(qValue);
    const residual = gradientNorm(state);
    const eigenvalues = symmetricEigenvalues(coupledHessian(state)).sort((a, b) => a - b);
    pass(
      `${label} coupled equilibrium`,
      residual < 1e-8 && eigenvalues[0] > 1e-6,
      `gradient norm ${fmt(residual, 8)}; eigenvalues ${eigenvalues.map((value) => fmt(value, 3)).join(", ")}`,
    );
  }

  pass(
    "Connector clearance",
    tr.minGap > 0.4,
    `minimum row spacing ${fmt(tr.minGap)}`,
  );
  pass(
    "Nonnegative damping coefficients",
    C_Q > 0 && C_NODE > 0 && RESET_C > 0,
    `C_Q=${C_Q}, C_NODE=${C_NODE}, reset C=${RESET_C}`,
  );

  const ordered = tr.snapTimes.every((time, index, all) => time > 0 && (index === 0 || time > all[index - 1] + 0.65));
  pass(
    "Sequential barrier crossings",
    ordered && tr.snapTimes[0] > 11 && tr.snapTimes[0] < 16.8 && tr.snapTimes[1] > 17 && tr.snapTimes[3] < 24.8,
    `crossing times ${tr.snapTimes.map((time) => fmt(time, 2)).join(", ")} s`,
  );

  const end = sampleAt(tr, DURATION);
  const midUnload = sampleAt(tr, 28);
  const release = sampleAt(tr, 32);
  pass(
    "Zero-load retention",
    release.q.every((q) => q > 0.9 && q < 1.08) &&
      end.q.every((q) => q > 0.93 && q < 1.06) &&
      end.force < 0.08 &&
      release.force < 0.08 &&
      end.kinetic < 0.01 &&
      end.specimenCompression > 0.9 &&
      end.yP > naturalHeight(1) + 0.05 &&
      end.yP < naturalHeight(0) - 0.4 &&
      tr.minQDuringUnload > 0.78,
    `final q=${end.q.map((q) => fmt(q, 3)).join(", ")}; force=${fmt(end.force)}; compression=${fmt(end.specimenCompression)}; platen=${fmt(end.yP)}; min q after 25 s=${fmt(tr.minQDuringUnload)}`,
  );

  let drops = 0;
  const dropDetails: string[] = [];
  tr.snapTimes.forEach((time, index) => {
    const before = sampleAt(tr, Math.max(0, time - 0.25));
    let low = before.force;
    for (let step = 0; step <= 20; step++) low = Math.min(low, sampleAt(tr, time + step * 0.05).force);
    const drop = before.force - low;
    if (drop > Math.max(0.04, 0.08 * before.force)) drops += 1;
    dropDetails.push(`row ${index + 1}: ${fmt(drop, 3)}`);
  });
  pass("Force drops at snaps", drops >= 3, dropDetails.join("; "));

  const start = sampleAt(tr, 0);
  pass(
    "Open force path",
    start.specimenCompression < 0.02 &&
      start.force < 0.02 &&
      end.specimenCompression > 0.85 &&
      end.force < 0.08 &&
      sampleAt(tr, 24).specimenCompression > end.specimenCompression + 0.05,
    `start (${fmt(start.specimenCompression)}, ${fmt(start.force)}), peak-window (${fmt(sampleAt(tr, 24).specimenCompression)}, ${fmt(sampleAt(tr, 24).force)}), end (${fmt(end.specimenCompression)}, ${fmt(end.force)})`,
  );

  const scale = Math.max(1, Math.abs(end.work), end.elastic, end.dissipated);
  pass(
    "Main-array energy balance",
    Math.abs(tr.finalBalanceResidual) / scale < 0.02 && tr.maxBalanceResidual / scale < 0.05,
    `final residual ${fmt(tr.finalBalanceResidual, 5)}, max residual ${fmt(tr.maxBalanceResidual, 5)}, end work ${fmt(end.work)}, elastic ${fmt(end.elastic)}, dissipated ${fmt(end.dissipated)}, kinetic ${fmt(end.kinetic)}`,
  );

  const beforeReset = sampleAt(tr, 27.8);
  const afterReset = sampleAt(tr, 33);
  pass(
    "Separate reset actuation",
    beforeReset.qReset > 0.98 &&
      beforeReset.resetForce === 0 &&
      Math.abs(sampleAt(tr, 29.2).resetForce) > 0 &&
      afterReset.qReset < 0.06 &&
      afterReset.qReset > -0.02 &&
      Math.abs(afterReset.vReset) < 0.04 &&
      end.q.every((q) => q > 0.9),
    `q_reset(27.8)=${fmt(beforeReset.qReset)}, q_reset(33)=${fmt(afterReset.qReset)}, v=${fmt(afterReset.vReset)}, trigger work=${fmt(afterReset.resetWork)}, released elastic=${fmt(U(1, RESET_LAMBDA) - U(afterReset.qReset, RESET_LAMBDA))}`,
  );

  const arcA = illustrativeArcLength(0, H_A - BAR_THICKNESS);
  const arcB = illustrativeArcLength(1, rowRestHeight(1) - BAR_THICKNESS);
  pass(
    "Illustrative arc length stays in a bounded band",
    arcB / arcA > 0.5 && arcB / arcA < 1.2,
    `State A arc ${fmt(arcA)}, State B arc ${fmt(arcB)}, ratio ${fmt(arcB / arcA)}. This is a kinematic drawing check, not a beam-element constraint.`,
  );

  const seekA = sampleAt(tr, 18.25);
  const seekB = sampleAt(tr, 18.25);
  pass(
    "Repeatable sampling",
    seekA.q.every((q, i) => q === seekB.q[i]) && seekA.force === seekB.force,
    "two samples at t=18.25 s match exactly",
  );

  const dissipatedNeverDrops = (() => {
    let previous = 0;
    for (let t = 0; t <= DURATION; t += 0.25) {
      const value = sampleAt(tr, t).dissipated;
      if (value < previous - 1e-6) return false;
      previous = value;
    }
    return true;
  })();
  pass("Dissipation is accumulated and nonnegative", dissipatedNeverDrops && end.dissipated >= 0, `end dissipated ${fmt(end.dissipated)}`);

  const lines = [
    "# Reduced-order model validation",
    "",
    "Evidence level: illustrative reduced-order model. Not experimental validation, finite-element verification, material calibration, or an impact test.",
    "",
    `Duration ${DURATION} s. Sample rate ${tr.hz} Hz. Rows ${N_ROWS}.`,
    `Q_M=${Q_M}, H_A=${H_A}, DELTA_H=${DELTA_H}, λ=[${LAMBDAS.join(", ")}].`,
    `K_AX=${K_AX}, M_Q=${M_Q}, C_Q=${C_Q}, M_NODE=${M_NODE}, C_NODE=${C_NODE}, K_CONTACT=${K_CONTACT}.`,
    `Initial clearance ${INITIAL_CLEARANCE}. Lift gap ${LIFT_GAP}. Platen keyframes live in platenMotion.`,
    `Reset λ=${RESET_LAMBDA}, mass=${RESET_M}, damping=${RESET_C}, force factor=${RESET_FORCE_FACTOR}, critical force=${fmt(criticalResetForce())}, pulse ${RESET_PULSE.t0}–${RESET_PULSE.t3} s.`,
    `Drawing amplitudes State A ${AMP_A}, State B ${AMP_B}.`,
    "",
    `Unloaded array height State A ${fmt(naturalHeight(0))}, State B ${fmt(naturalHeight(1))}.`,
    `Mid-unload t=28 s compression ${fmt(midUnload.specimenCompression)}, force ${fmt(midUnload.force)}, q=${midUnload.q.map((q) => fmt(q, 3)).join(", ")}.`,
    "",
    "## Checks",
    "",
    ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"}: ${check.name}. ${check.detail}`),
    "",
    "## Approximations",
    "",
    "- One coordinate per row. Three side-by-side cells in a row share that coordinate in the drawing.",
    "- The rendered beam is a clamped kinematic map of q and the current connector spacing. Arc length is not enforced by a beam element.",
    "- Contact is a smooth unilateral penalty, not a rigid constraint solver.",
    "- A one-sided quartic wall acts only for q > 1. It leaves both minima, their curvatures, and the barrier unchanged, and keeps an already-switched row from collapsing when later rows are still being compressed.",
    "- Viscous terms are illustrative material damping. They are not a calibrated viscoelastic polymer model.",
    "- Visible snap timing is the timing of this nondimensional trajectory. It is not a predicted laboratory switching time.",
    "- No friction, plasticity, fracture, latch, or magnetic term is present.",
    "",
  ];

  return { checks, ok: checks.every((check) => check.ok), trajectory: tr, lines };
}
