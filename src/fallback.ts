import { N_ROWS, outwardAmp, type Frame } from "./sim/physics.ts";

export function drawSchematic(canvas: HTMLCanvasElement, frame: Frame) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#101219";
  ctx.fillRect(0, 0, width, height);
  const top = 36;
  const bottom = height - 28;
  const usable = Math.max(40, frame.y[4] + 0.2);
  const yOf = (y: number) => bottom - (y / usable) * (bottom - top);
  const mid = width * 0.5;
  ctx.strokeStyle = "#6C7787";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(mid - 120, yOf(0));
  ctx.lineTo(mid + 120, yOf(0));
  ctx.moveTo(mid - 120, yOf(frame.yP));
  ctx.lineTo(mid + 120, yOf(frame.yP));
  ctx.stroke();
  for (let row = 0; row < N_ROWS; row++) {
    const y0 = yOf(frame.y[row]);
    const y1 = yOf(frame.y[row + 1]);
    const amp = outwardAmp(frame.q[row]) * 70;
    ctx.strokeStyle = frame.q[row] > 0.7 ? "#7FE7F2" : "#30445A";
    ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const s = i / 24;
        const x = mid + side * (28 + amp * (1 - Math.cos(Math.PI * 2 * s)) / 2);
        const y = y0 + (y1 - y0) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#E6E8EE";
  ctx.font = "14px sans-serif";
  ctx.fillText("Flat schematic of the same reduced-order state", 16, 22);
}
