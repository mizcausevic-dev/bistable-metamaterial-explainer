import { Q_M, U, LAMBDAS, readChart, type Trajectory } from "./sim/physics.ts";

const INK = "#101219";
const BONE = "#E7E4DC";
const MUTED = "#A7B0BD";
const AMBER = "#FFB703";
const GRID = "rgba(255,255,255,0.08)";

export function drawPotential(canvas: HTMLCanvasElement) {
  const ctx = context2d(canvas);
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const pad = { l: 46, r: 14, t: 16, b: 36 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const q0 = -0.08;
  const q1 = 1.18;
  const lambda = LAMBDAS[0];
  let yMax = 0.001;
  for (let i = 0; i <= 80; i++) yMax = Math.max(yMax, U(q0 + ((q1 - q0) * i) / 80, lambda));
  yMax *= 1.18;
  const xOf = (q: number) => pad.l + ((q - q0) / (q1 - q0)) * plotW;
  const yOf = (u: number) => pad.t + (1 - u / yMax) * plotH;

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 80; i++) {
    const q = q0 + ((q1 - q0) * i) / 80;
    const x = xOf(q);
    const y = yOf(Math.max(0, U(q, lambda)));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  mark(ctx, xOf(0), yOf(U(0, lambda)), "square");
  mark(ctx, xOf(Q_M), yOf(U(Q_M, lambda)), "cross");
  mark(ctx, xOf(1), yOf(U(1, lambda)), "diamond");

  ctx.fillStyle = MUTED;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Deformation coordinate q", pad.l, height - 10);
  ctx.save();
  ctx.translate(14, pad.t + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Elastic potential", 0, 0);
  ctx.restore();
  ctx.fillStyle = BONE;
  ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Unloaded reference landscape", pad.l, 14);
}

export function drawForce(canvas: HTMLCanvasElement, tr: Trajectory, time: number) {
  const ctx = context2d(canvas);
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const pad = { l: 48, r: 16, t: 16, b: 42 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const point = { t: 0, compression: 0, force: 0 };
  let xMax = 0.2;
  let yMax = 0.2;
  const last = Math.min(tr.count - 1, Math.floor(time * tr.hz));
  for (let i = 0; i <= tr.count - 1; i += 8) {
    readChart(tr, i, point);
    xMax = Math.max(xMax, point.compression);
    yMax = Math.max(yMax, point.force);
  }
  xMax *= 1.08;
  yMax *= 1.15;
  const xOf = (x: number) => pad.l + (x / xMax) * plotW;
  const yOf = (y: number) => pad.t + (1 - y / yMax) * plotH;

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();

  const raw: { t: number; compression: number; force: number }[] = [];
  for (let i = 0; i <= last; i += 2) {
    readChart(tr, i, point);
    raw.push({ t: point.t, compression: point.compression, force: Math.max(0, point.force) });
  }
  const smoothRadius = 12;
  let previous: { x: number; y: number; unload: boolean } | null = null;
  let peak = 0;
  for (let i = 0; i < raw.length; i++) {
    const start = Math.max(0, i - smoothRadius);
    const end = Math.min(raw.length - 1, i + smoothRadius);
    let compression = 0;
    let force = 0;
    for (let k = start; k <= end; k++) {
      compression += raw[k].compression;
      force += raw[k].force;
    }
    const count = end - start + 1;
    compression /= count;
    force /= count;
    peak = Math.max(peak, compression);
    const unload = raw[i].t > 24.8 && compression < peak - 0.02;
    const current = { x: xOf(compression), y: yOf(force), unload };
    if (previous) {
      ctx.beginPath();
      ctx.strokeStyle = current.unload ? "#C9CED6" : AMBER;
      ctx.setLineDash(current.unload ? [5, 4] : []);
      ctx.lineWidth = 2;
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    previous = current;
  }
  ctx.setLineDash([]);
  if (previous) {
    ctx.beginPath();
    ctx.fillStyle = "#F4F1EA";
    ctx.arc(previous.x, previous.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  ctx.fillStyle = MUTED;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Specimen compression", pad.l, height - 8);
  ctx.save();
  ctx.translate(14, pad.t + plotH * 0.72);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Actuator force", 0, 0);
  ctx.restore();
}

export function drawEnergy(canvas: HTMLCanvasElement, values: { work: number; elastic: number; kinetic: number; dissipated: number }, scale: number) {
  const ctx = context2d(canvas);
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const rows = [
    ["External work", values.work, AMBER],
    ["Elastic energy", values.elastic, "#E7E4DC"],
    ["Kinetic energy", values.kinetic, "#8FB4C4"],
    ["Dissipated", values.dissipated, "#C47B8A"],
  ] as const;
  const labelW = Math.min(118, width * 0.42);
  const rowH = height / rows.length;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  rows.forEach((row, index) => {
    const y = index * rowH + 4;
    ctx.fillStyle = BONE;
    ctx.fillText(row[0], 0, y + 14);
    const barX = labelW;
    const barW = Math.max(8, width - labelW - 52);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(barX, y + 4, barW, 12);
    ctx.fillStyle = row[2];
    ctx.fillRect(barX, y + 4, barW * Math.max(0, Math.min(1, row[1] / scale)), 12);
    ctx.fillStyle = MUTED;
    ctx.fillText(row[1].toFixed(2), barX + barW + 6, y + 14);
  });
}

function mark(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "square" | "cross" | "diamond") {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#F4F1EA";
  ctx.fillStyle = "#F4F1EA";
  ctx.lineWidth = 1.6;
  if (kind === "square") ctx.fillRect(-4, -4, 8, 8);
  else if (kind === "diamond") {
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, 5);
    ctx.moveTo(5, -5);
    ctx.lineTo(-5, 5);
    ctx.stroke();
  }
  ctx.restore();
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
