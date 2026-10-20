/**
 * Illustrative reduced-order model of a series array of conceptually bistable cells.
 *
 * Evidence level: illustrative reduced-order model, not experimental validation.
 * A single precomputed trajectory drives geometry, force, and energy readouts.
 *
 * Each row has one internal coordinate q. q = 0 is State A. q = 1 is State B.
 * Movement toward State B shortens the row: h(q) = H_A - DELTA_H * q.
 *
 * Unloaded elastic potential of a row, constructed so the equilibria sit exactly
 * at q = 0 and q = 1 when Q_M is between them and above one half:
 *   U(q) = λ [ q^4/4 - (1+Q_M) q^3/3 + Q_M q^2/2 ] + wall(q)
 *   U'(q) = λ q (q-1) (q-Q_M) + wall'(q)
 * State A is the lower well. State B is the higher well. Q_M is the barrier.
 * wall(q) is zero for q <= 1, so both equilibria and their curvatures stay exact.
 *
 * Rows are stacked in series along Y. Connector coordinates are dynamic.
 * A stiff unilateral penalty represents contact with a prescribed platen.
 * The platen trajectory is displacement-controlled and smooth. Local row
 * coordinates are not prescribed, so a snap can redistribute length without
 * a jump in platen position.
 *
 * Small fixed differences in λ select the switching order. They are constant
 * for the life of the build, not redrawn per session.
 *
 * System boundary for the main array: four row coordinates, three internal
 * connectors, the specimen top face, axial springs, bistable potentials, and
 * the contact penalty. The external agent is the prescribed platen motion.
 * Reset actuation belongs to a duplicate cell and is integrated separately.
 */

export const DURATION = 34;
export const SAMPLE_HZ = 240;
export const N_ROWS = 4;
export const Q_M = 0.7;
export const H_A = 1;
export const DELTA_H = 0.32;
export const LAMBDAS = [1.05, 1.85, 2.6, 3.4] as const;
export const K_AX = 6.5;
export const POST_SWITCH_WALL = 18;
export const M_Q = 0.34;
export const C_Q = 0.58;
export const M_NODE = 0.16;
export const C_NODE = 0.62;
export const K_CONTACT = 700;
export const CONTACT_EPS = 0.0012;
export const INITIAL_CLEARANCE = 0.03;
export const LIFT_GAP = 0.18;
export const AMP_A = 0.38;
export const AMP_B = -0.2;
export const BAR_THICKNESS = 0.08;

export const RESET_LAMBDA = LAMBDAS[0];
export const RESET_M = 0.07;
export const RESET_C = 0.4;
export const RESET_FORCE_FACTOR = 9;
export const RESET_PULSE = { t0: 28.45, t1: 28.7, t2: 29.85, t3: 30.15 } as const;

const SUBSTEPS = 4;
const STATE_N = 22;

export function smoothstep(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function postSwitchEnergy(q: number): number {
  const x = q - 1;
  return x > 0 ? POST_SWITCH_WALL * x ** 4 : 0;
}

function postSwitchSlope(q: number): number {
  const x = q - 1;
  return x > 0 ? 4 * POST_SWITCH_WALL * x ** 3 : 0;
}

function postSwitchCurve(q: number): number {
  const x = q - 1;
  return x > 0 ? 12 * POST_SWITCH_WALL * x * x : 0;
}

export function U(q: number, lambda: number): number {
  return lambda * (q ** 4 / 4 - (1 + Q_M) * q ** 3 / 3 + (Q_M * q * q) / 2) + postSwitchEnergy(q);
}

export function Up(q: number, lambda: number): number {
  return lambda * (q ** 3 - (1 + Q_M) * q * q + Q_M * q) + postSwitchSlope(q);
}

export function Upp(q: number, lambda: number): number {
  return lambda * (3 * q * q - 2 * (1 + Q_M) * q + Q_M) + postSwitchCurve(q);
}

export function rowRestHeight(q: number): number {
  return H_A - DELTA_H * q;
}

export function naturalHeight(q: number): number {
  return N_ROWS * rowRestHeight(q);
}

export function outwardAmp(q: number): number {
  if (q <= Q_M) return (AMP_A * (Q_M - q)) / Q_M;
  return (AMP_B * (q - Q_M)) / (1 - Q_M);
}

export function illustrativeArcLength(q: number, gap: number, samples = 64): number {
  const amp = outwardAmp(q);
  let length = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= samples; i++) {
    const s = i / samples;
    const y = gap * s;
    const x = (amp * (1 - Math.cos(2 * Math.PI * s))) / 2;
    if (i > 0) length += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return length;
}

export function platenMotion(t: number): { y: number; yd: number } {
  const H = naturalHeight(0);
  const yOpen = H + INITIAL_CLEARANCE;
  const yRest = naturalHeight(1) + LIFT_GAP;
  const keys = [
    { t: 0, y: yOpen },
    { t: 10, y: yOpen },
    { t: 12.05, y: H - 0.5 },
    { t: 13.1, y: H - 0.76 },
    { t: 16.4, y: H - 0.76 },
    { t: 17.2, y: H - 1.06 },
    { t: 19.45, y: H - 1.06 },
    { t: 20.15, y: H - 1.5 },
    { t: 21.55, y: H - 1.5 },
    { t: 22.25, y: H - 1.84 },
    { t: 24.45, y: H - 1.84 },
    { t: 25.05, y: H - 1.84 },
    { t: 27.95, y: yRest },
    { t: DURATION, y: yRest },
  ];
  const tt = Math.min(DURATION, Math.max(0, t));
  let i = 0;
  while (i < keys.length - 2 && tt >= keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  const u = span > 0 ? (tt - a.t) / span : 1;
  const s = u * u * (3 - 2 * u);
  const yd = span > 0 ? (b.y - a.y) * ((6 * u * (1 - u)) / span) : 0;
  return { y: a.y + (b.y - a.y) * s, yd };
}

/** Most negative U' on the State B side of the barrier. A more negative force removes that well. */
export function criticalResetForce(lambda = RESET_LAMBDA): number {
  let min = 0;
  for (let i = 1; i < 2400; i++) {
    const q = Q_M + (1 - Q_M) * (i / 2400);
    const slope = Up(q, lambda);
    if (slope < min) min = slope;
  }
  return min;
}

export function resetForce(t: number): number {
  const { t0, t1, t2, t3 } = RESET_PULSE;
  const peak = RESET_FORCE_FACTOR * criticalResetForce();
  let envelope = 0;
  if (t > t0 && t < t3) {
    if (t < t1) envelope = smoothstep((t - t0) / (t1 - t0));
    else if (t < t2) envelope = 1;
    else envelope = 1 - smoothstep((t - t2) / (t3 - t2));
  }
  return peak * envelope;
}

export type Frame = {
  t: number;
  q: number[];
  vq: number[];
  y: number[];
  yP: number;
  yPd: number;
  force: number;
  elastic: number;
  contact: number;
  kinetic: number;
  dissipated: number;
  work: number;
  qReset: number;
  vReset: number;
  resetWork: number;
  resetDissipated: number;
  resetForce: number;
  specimenCompression: number;
};

export type Trajectory = {
  hz: number;
  count: number;
  duration: number;
  frames: Float64Array;
  snapTimes: number[];
  minGap: number;
  maxBalanceResidual: number;
  finalBalanceResidual: number;
  minQDuringUnload: number;
  maxForceAfterRelease: number;
};

const FRAME_STRIDE = 1 + 4 + 4 + 5 + 12;

function softPositive(x: number): number {
  return 0.5 * (x + Math.hypot(x, CONTACT_EPS));
}

function softPositiveSlope(x: number): number {
  return 0.5 * (1 + x / Math.hypot(x, CONTACT_EPS));
}

function contactForce(yTop: number, yP: number): { force: number; energy: number } {
  const g = yTop - yP;
  const p = softPositive(g);
  const dp = softPositiveSlope(g);
  return { force: K_CONTACT * p * dp, energy: 0.5 * K_CONTACT * p * p };
}

function writeDeriv(y: Float64Array, t: number, out: Float64Array): void {
  const pos = [0, y[8], y[9], y[10], y[14]];
  const vel = [0, y[11], y[12], y[13], y[15]];
  const nodeForce = [0, 0, 0, 0, 0];
  const { y: yP, yd: yPd } = platenMotion(t);

  for (let i = 0; i < N_ROWS; i++) {
    const q = y[i];
    const vq = y[4 + i];
    const length = pos[i + 1] - pos[i];
    const rest = rowRestHeight(q);
    const stretch = length - rest;
    const axial = K_AX * stretch;
    nodeForce[i + 1] -= axial;
    nodeForce[i] += axial;
    out[i] = vq;
    out[4 + i] = (-Up(q, LAMBDAS[i]) - axial * DELTA_H - C_Q * vq) / M_Q;
  }

  const contact = contactForce(pos[4], yP);
  nodeForce[4] -= contact.force;

  out[8] = vel[1];
  out[9] = vel[2];
  out[10] = vel[3];
  out[11] = (nodeForce[1] - C_NODE * vel[1]) / M_NODE;
  out[12] = (nodeForce[2] - C_NODE * vel[2]) / M_NODE;
  out[13] = (nodeForce[3] - C_NODE * vel[3]) / M_NODE;
  out[14] = vel[4];
  out[15] = (nodeForce[4] - C_NODE * vel[4]) / M_NODE;
  out[16] = -contact.force * yPd;

  let dissipation = 0;
  for (let i = 0; i < N_ROWS; i++) dissipation += C_Q * y[4 + i] * y[4 + i];
  dissipation += C_NODE * (vel[1] ** 2 + vel[2] ** 2 + vel[3] ** 2 + vel[4] ** 2);
  out[17] = dissipation;

  const qR = y[18];
  const vR = y[19];
  const fr = resetForce(t);
  out[18] = vR;
  out[19] = (-Up(qR, RESET_LAMBDA) + fr - RESET_C * vR) / RESET_M;
  out[20] = fr * vR;
  out[21] = RESET_C * vR * vR;
}

function rk4(y: Float64Array, t: number, dt: number, k1: Float64Array, k2: Float64Array, k3: Float64Array, k4: Float64Array, tmp: Float64Array): void {
  writeDeriv(y, t, k1);
  for (let i = 0; i < STATE_N; i++) tmp[i] = y[i] + 0.5 * dt * k1[i];
  writeDeriv(tmp, t + 0.5 * dt, k2);
  for (let i = 0; i < STATE_N; i++) tmp[i] = y[i] + 0.5 * dt * k2[i];
  writeDeriv(tmp, t + 0.5 * dt, k3);
  for (let i = 0; i < STATE_N; i++) tmp[i] = y[i] + dt * k3[i];
  writeDeriv(tmp, t + dt, k4);
  const scale = dt / 6;
  for (let i = 0; i < STATE_N; i++) y[i] += scale * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

function elasticOf(y: Float64Array): number {
  const pos = [0, y[8], y[9], y[10], y[14]];
  let elastic = 0;
  for (let i = 0; i < N_ROWS; i++) {
    elastic += U(y[i], LAMBDAS[i]);
    const stretch = pos[i + 1] - pos[i] - rowRestHeight(y[i]);
    elastic += 0.5 * K_AX * stretch * stretch;
  }
  return elastic;
}

function kineticOf(y: Float64Array): number {
  let kinetic = 0;
  for (let i = 0; i < N_ROWS; i++) kinetic += 0.5 * M_Q * y[4 + i] * y[4 + i];
  kinetic += 0.5 * M_NODE * (y[11] ** 2 + y[12] ** 2 + y[13] ** 2 + y[15] ** 2);
  return kinetic;
}

export function frameFromState(y: Float64Array, t: number): Frame {
  const motion = platenMotion(t);
  const contact = contactForce(y[14], motion.y);
  const q = [y[0], y[1], y[2], y[3]];
  const vq = [y[4], y[5], y[6], y[7]];
  return {
    t,
    q,
    vq,
    y: [0, y[8], y[9], y[10], y[14]],
    yP: motion.y,
    yPd: motion.yd,
    force: contact.force,
    elastic: elasticOf(y),
    contact: contact.energy,
    kinetic: kineticOf(y),
    dissipated: y[17],
    work: y[16],
    qReset: y[18],
    vReset: y[19],
    resetWork: y[20],
    resetDissipated: y[21],
    resetForce: resetForce(t),
    specimenCompression: naturalHeight(0) - y[14],
  };
}

function packFrame(target: Float64Array, offset: number, frame: Frame): void {
  let p = offset;
  target[p++] = frame.t;
  for (let i = 0; i < 4; i++) target[p++] = frame.q[i];
  for (let i = 0; i < 4; i++) target[p++] = frame.vq[i];
  for (let i = 0; i < 5; i++) target[p++] = frame.y[i];
  const rest = [
    frame.yP,
    frame.yPd,
    frame.force,
    frame.elastic,
    frame.contact,
    frame.kinetic,
    frame.dissipated,
    frame.work,
    frame.qReset,
    frame.vReset,
    frame.resetWork,
    frame.resetDissipated,
  ];
  for (const value of rest) target[p++] = value;
}

export function precompute(): Trajectory {
  const count = DURATION * SAMPLE_HZ + 1;
  const frames = new Float64Array(count * FRAME_STRIDE);
  const y = new Float64Array(STATE_N);
  y[8] = H_A;
  y[9] = 2 * H_A;
  y[10] = 3 * H_A;
  y[14] = N_ROWS * H_A;
  y[18] = 1;

  const k1 = new Float64Array(STATE_N);
  const k2 = new Float64Array(STATE_N);
  const k3 = new Float64Array(STATE_N);
  const k4 = new Float64Array(STATE_N);
  const tmp = new Float64Array(STATE_N);
  const dt = 1 / (SAMPLE_HZ * SUBSTEPS);
  const snapTimes = [-1, -1, -1, -1];
  const prevQ = [0, 0, 0, 0];
  let minGap = Infinity;
  let maxBalanceResidual = 0;
  let minQDuringUnload = Infinity;
  let maxForceAfterRelease = 0;

  for (let sample = 0; sample < count; sample++) {
    const t = sample / SAMPLE_HZ;
    const frame = frameFromState(y, t);
    packFrame(frames, sample * FRAME_STRIDE, frame);
    let gap = Infinity;
    for (let i = 0; i < N_ROWS; i++) gap = Math.min(gap, frame.y[i + 1] - frame.y[i]);
    minGap = Math.min(minGap, gap);
    const residual = frame.elastic + frame.contact + frame.kinetic + frame.dissipated - frame.work;
    maxBalanceResidual = Math.max(maxBalanceResidual, Math.abs(residual));
    if (t >= 25) {
      minQDuringUnload = Math.min(minQDuringUnload, ...frame.q);
      if (t >= 31.4) maxForceAfterRelease = Math.max(maxForceAfterRelease, frame.force);
    }
    for (let i = 0; i < N_ROWS; i++) {
      if (snapTimes[i] < 0 && prevQ[i] < Q_M && frame.q[i] >= Q_M) snapTimes[i] = t;
      prevQ[i] = frame.q[i];
    }
    if (sample === count - 1) break;
    for (let sub = 0; sub < SUBSTEPS; sub++) rk4(y, t + sub * dt, dt, k1, k2, k3, k4, tmp);
  }

  const finalFrame = frameFromState(y, DURATION);
  const finalBalanceResidual = finalFrame.elastic + finalFrame.contact + finalFrame.kinetic + finalFrame.dissipated - finalFrame.work;

  return {
    hz: SAMPLE_HZ,
    count,
    duration: DURATION,
    frames,
    snapTimes,
    minGap,
    maxBalanceResidual,
    finalBalanceResidual,
    minQDuringUnload,
    maxForceAfterRelease,
  };
}

export function sampleAt(tr: Trajectory, time: number): Frame {
  const t = Math.min(tr.duration, Math.max(0, time));
  const scaled = t * tr.hz;
  const i0 = Math.min(tr.count - 1, Math.floor(scaled));
  const i1 = Math.min(tr.count - 1, i0 + 1);
  const u = scaled - i0;
  const a = readPacked(tr.frames, i0);
  if (i0 === i1) return a;
  const b = readPacked(tr.frames, i1);
  const lerp = (p: number, q: number) => p + (q - p) * u;
  return {
    t,
    q: a.q.map((value, i) => lerp(value, b.q[i])),
    vq: a.vq.map((value, i) => lerp(value, b.vq[i])),
    y: a.y.map((value, i) => lerp(value, b.y[i])),
    yP: lerp(a.yP, b.yP),
    yPd: lerp(a.yPd, b.yPd),
    force: lerp(a.force, b.force),
    elastic: lerp(a.elastic, b.elastic),
    contact: lerp(a.contact, b.contact),
    kinetic: lerp(a.kinetic, b.kinetic),
    dissipated: lerp(a.dissipated, b.dissipated),
    work: lerp(a.work, b.work),
    qReset: lerp(a.qReset, b.qReset),
    vReset: lerp(a.vReset, b.vReset),
    resetWork: lerp(a.resetWork, b.resetWork),
    resetDissipated: lerp(a.resetDissipated, b.resetDissipated),
    resetForce: resetForce(t),
    specimenCompression: lerp(a.specimenCompression, b.specimenCompression),
  };
}

function readPacked(buffer: Float64Array, index: number): Frame {
  let p = index * FRAME_STRIDE;
  const t = buffer[p++];
  const q = [buffer[p++], buffer[p++], buffer[p++], buffer[p++]];
  const vq = [buffer[p++], buffer[p++], buffer[p++], buffer[p++]];
  const y = [buffer[p++], buffer[p++], buffer[p++], buffer[p++], buffer[p++]];
  const yP = buffer[p++];
  const yPd = buffer[p++];
  const force = buffer[p++];
  const elastic = buffer[p++];
  const contact = buffer[p++];
  const kinetic = buffer[p++];
  const dissipated = buffer[p++];
  const work = buffer[p++];
  const qReset = buffer[p++];
  const vReset = buffer[p++];
  const resetWork = buffer[p++];
  const resetDissipated = buffer[p++];
  return {
    t,
    q,
    vq,
    y,
    yP,
    yPd,
    force,
    elastic,
    contact,
    kinetic,
    dissipated,
    work,
    qReset,
    vReset,
    resetWork,
    resetDissipated,
    resetForce: resetForce(t),
    specimenCompression: naturalHeight(0) - y[4],
  };
}

export function analyticGradient(p: number[]): number[] {
  const q = p.slice(0, 4);
  const y = [0, p[4], p[5], p[6], p[7]];
  const g = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N_ROWS; i++) {
    const stretch = y[i + 1] - y[i] - rowRestHeight(q[i]);
    g[i] = Up(q[i], LAMBDAS[i]) + K_AX * stretch * DELTA_H;
    if (i < N_ROWS - 1) g[4 + i] += K_AX * stretch;
    else g[7] += K_AX * stretch;
    if (i > 0) g[3 + i] -= K_AX * stretch;
  }
  return g;
}

export function unloadedState(qValue: number): number[] {
  const h = rowRestHeight(qValue);
  return [qValue, qValue, qValue, qValue, h, 2 * h, 3 * h, 4 * h];
}

export function coupledHessian(p: number[]): number[][] {
  const n = 8;
  const h = Array.from({ length: n }, () => Array(n).fill(0));
  const eps = 1e-5;
  const base = analyticGradient(p);
  for (let j = 0; j < n; j++) {
    const shifted = p.slice();
    shifted[j] += eps;
    const next = analyticGradient(shifted);
    for (let i = 0; i < n; i++) h[i][j] = (next[i] - base[i]) / eps;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const symmetric = 0.5 * (h[i][j] + h[j][i]);
      h[i][j] = symmetric;
      h[j][i] = symmetric;
    }
  }
  return h;
}

export function symmetricEigenvalues(matrix: number[][]): number[] {
  const n = matrix.length;
  const m = matrix.map((row) => row.slice());
  for (let iter = 0; iter < 96; iter++) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const value = Math.abs(m[i][j]);
        if (value > max) {
          max = value;
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-12) break;
    const app = m[p][p];
    const aqq = m[q][q];
    const apq = m[p][q];
    const tau = (aqq - app) / (2 * apq);
    const tangent = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;
    for (let k = 0; k < n; k++) {
      if (k === p || k === q) continue;
      const mkp = m[k][p];
      const mkq = m[k][q];
      const nextP = cosine * mkp - sine * mkq;
      const nextQ = sine * mkp + cosine * mkq;
      m[k][p] = nextP;
      m[p][k] = nextP;
      m[k][q] = nextQ;
      m[q][k] = nextQ;
    }
    m[p][p] = app - tangent * apq;
    m[q][q] = aqq + tangent * apq;
    m[p][q] = 0;
    m[q][p] = 0;
  }
  return m.map((row, i) => row[i]);
}

export function readChart(tr: Trajectory, index: number, out: { t: number; compression: number; force: number }): void {
  const base = index * FRAME_STRIDE;
  out.t = tr.frames[base];
  out.compression = naturalHeight(0) - tr.frames[base + 13];
  out.force = tr.frames[base + 16];
}

export function readEnergy(tr: Trajectory, index: number, out: { elastic: number; kinetic: number; dissipated: number; work: number }): void {
  const base = index * FRAME_STRIDE;
  out.elastic = tr.frames[base + 17];
  out.kinetic = tr.frames[base + 19];
  out.dissipated = tr.frames[base + 20];
  out.work = tr.frames[base + 21];
}

export function potentialChecks(lambda: number = RESET_LAMBDA): {
  upA: number;
  upB: number;
  uppA: number;
  uppB: number;
  uA: number;
  uB: number;
  uBarrier: number;
} {
  return {
    upA: Up(0, lambda),
    upB: Up(1, lambda),
    uppA: Upp(0, lambda),
    uppB: Upp(1, lambda),
    uA: U(0, lambda),
    uB: U(1, lambda),
    uBarrier: U(Q_M, lambda),
  };
}
