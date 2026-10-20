import { createScore, type Score } from "./audio.ts";
import { drawEnergy, drawForce, drawPotential } from "./charts.ts";
import { drawSchematic } from "./fallback.ts";
import { createView, type View } from "./scene.ts";
import { assess } from "./sim/report.ts";
import { DURATION, readEnergy, sampleAt, type Frame, type Trajectory } from "./sim/physics.ts";

const SHOTS = [
  { t: 0, name: "Shot 1. Initial array." },
  { t: 5, name: "Shot 2. Bistable cell." },
  { t: 10, name: "Shot 3. Loading and instability." },
  { t: 17, name: "Shot 4. Sequential switching." },
  { t: 25, name: "Shot 5. Retention and reset." },
];

const loading = must("#loading");
const loadingCopy = must("#loading-copy");
const enter = must<HTMLButtonElement>("#enter");
const errorBox = must("#error");
const playButton = must<HTMLButtonElement>("#play");
const timeline = must<HTMLInputElement>("#timeline");
const timeReadout = must("#readout-time");
const shotStatus = must("#shot-status");
const stateReadout = must("#state-readout");
const phaseNote = must("#phase-note");
const insetFrame = must("#inset-frame");
const insetView = must("#inset-view");
const insetNote = must("#inset-note");
const axes = must("#axes");
const calloutList = must("#callout-list");
const calloutSvg = must<SVGSVGElement>("#callouts");
const glCanvas = must<HTMLCanvasElement>("#gl");
const fallbackCanvas = must<HTMLCanvasElement>("#fallback");
const potentialCanvas = must<HTMLCanvasElement>("#potential");
const forceCanvas = must<HTMLCanvasElement>("#force");
const energyCanvas = must<HTMLCanvasElement>("#energy");
const muteButton = must<HTMLButtonElement>("#mute");
const musicInput = must<HTMLInputElement>("#music");
const effectsInput = must<HTMLInputElement>("#effects");
const reducedInput = must<HTMLInputElement>("#reduced");
const glNote = must("#gl-note");
const checkSummary = must("#check-summary");

const params = new URLSearchParams(location.search);
const reducedPreference = localStorage.getItem("bistable-reduced-motion");
let reducedMotion = params.get("reduced") === "1" || (reducedPreference === null ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : reducedPreference === "1");
reducedInput.checked = reducedMotion;

let time = clampTime(Number(params.get("t") ?? "0") || 0);
let playing = false;
let score: Score | null = null;
let view: View | null = null;
let trajectory: Trajectory | null = null;
let energyScale = 1;
let perfOrigin = 0;
const screen = { x: 0, y: 0, visible: false };
const energyProbe = { elastic: 0, kinetic: 0, dissipated: 0, work: 0 };

void boot();

async function boot() {
  try {
    const report = assess();
    trajectory = report.trajectory;
    const passed = report.checks.filter((check) => check.ok).length;
    checkSummary.textContent = report.ok
      ? `Model checks computed in this session: ${passed} passed.`
      : `Model checks computed in this session: ${report.checks.filter((check) => !check.ok).map((check) => check.name).join("; ")} failed.`;
    energyScale = 0.001;
    for (let index = 0; index < trajectory.count; index += 6) {
      readEnergy(trajectory, index, energyProbe);
      energyScale = Math.max(energyScale, energyProbe.elastic, energyProbe.kinetic, energyProbe.dissipated, energyProbe.work);
    }
    energyScale *= 1.08;
    score = await createScore(trajectory, () => {
      playing = false;
      time = DURATION;
      syncControls(sampleAt(trajectory as Trajectory, time));
    });
    view = createView(glCanvas);
    if (!view) activateFallback("WebGL is unavailable. The schematic uses the same reduced-order state.");
    drawPotential(potentialCanvas);
    loadingCopy.textContent = reducedMotion ? "Reduced motion is on. Enter, then press Play or scrub." : "Trajectory ready.";
    enter.hidden = false;
    enter.textContent = reducedMotion ? "Enter explainer" : "Play explainer";
    renderFrame(sampleAt(trajectory, time));
  } catch (error) {
    showError(error instanceof Error ? error.message : "The explainer failed to start.");
  }
}

enter.addEventListener("click", () => {
  void startFromGesture(reducedMotion ? false : true);
});
playButton.addEventListener("click", () => {
  if (playing) pause();
  else void startFromGesture(true);
});
must<HTMLButtonElement>("#replay").addEventListener("click", () => {
  time = 0;
  void startFromGesture(true);
});
timeline.addEventListener("input", () => {
  time = clampTime(Number(timeline.value));
  if (playing && score) score.play(time);
  perfOrigin = performance.now() - time * 1000;
  if (trajectory) renderFrame(sampleAt(trajectory, time));
});
muteButton.addEventListener("click", () => {
  const muted = muteButton.getAttribute("aria-pressed") !== "true";
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.textContent = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  pushGains();
});
musicInput.addEventListener("input", pushGains);
effectsInput.addEventListener("input", pushGains);
reducedInput.addEventListener("change", () => {
  reducedMotion = reducedInput.checked;
  localStorage.setItem("bistable-reduced-motion", reducedMotion ? "1" : "0");
  if (trajectory) renderFrame(sampleAt(trajectory, time));
});
must<HTMLButtonElement>("#fullscreen").addEventListener("click", () => {
  if (!document.fullscreenElement) void must("#app").requestFullscreen?.();
  else void document.exitFullscreen?.();
});
document.querySelectorAll<HTMLButtonElement>("[data-shot]").forEach((button) => {
  button.addEventListener("click", () => {
    time = clampTime(Number(button.dataset.shot));
    if (playing && score) score.play(time);
    perfOrigin = performance.now() - time * 1000;
    if (trajectory) renderFrame(sampleAt(trajectory, time));
  });
});
must<HTMLButtonElement>("#about-open").addEventListener("click", () => must<HTMLDialogElement>("#about").showModal());
must<HTMLButtonElement>("#about-close").addEventListener("click", () => must<HTMLDialogElement>("#about").close());

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const typing = target instanceof HTMLInputElement && target.type !== "range";
  if (typing) return;
  if (event.key === " " || event.key === "k") {
    event.preventDefault();
    if (playing) pause();
    else void startFromGesture(true);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    nudge(event.shiftKey ? 0.1 : 1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    nudge(event.shiftKey ? -0.1 : -1);
  } else if (event.key === "Home") {
    event.preventDefault();
    nudge(-DURATION);
  } else if (event.key === "End") {
    event.preventDefault();
    time = DURATION;
    pause();
  } else if (event.key === "m" || event.key === "M") muteButton.click();
  else if (event.key === "f" || event.key === "F") must<HTMLButtonElement>("#fullscreen").click();
  else if (event.key === "r" || event.key === "R") must<HTMLButtonElement>("#replay").click();
  else if (event.key >= "1" && event.key <= "5") {
    time = SHOTS[Number(event.key) - 1].t;
    if (playing && score) score.play(time);
    perfOrigin = performance.now() - time * 1000;
    if (trajectory) renderFrame(sampleAt(trajectory, time));
  }
});

window.addEventListener("resize", () => {
  if (trajectory) renderFrame(sampleAt(trajectory, time));
});
glCanvas.addEventListener("webglcontextrestored", () => {
  if (trajectory) renderFrame(sampleAt(trajectory, time));
});

function nudge(delta: number) {
  time = clampTime(time + delta);
  if (playing && score) score.play(time);
  perfOrigin = performance.now() - time * 1000;
  if (trajectory) renderFrame(sampleAt(trajectory, time));
}

async function startFromGesture(shouldPlay: boolean) {
  loading.hidden = true;
  try {
    await score?.unlock();
  } catch {
    glNote.hidden = false;
    glNote.textContent = "Audio could not start. The picture still follows the timeline.";
  }
  if (!shouldPlay) {
    playing = false;
    if (trajectory) renderFrame(sampleAt(trajectory, time));
    return;
  }
  if (time >= DURATION - 0.001) time = 0;
  playing = true;
  perfOrigin = performance.now() - time * 1000;
  score?.play(time);
  ensureLoop();
}

function pause() {
  if (playing && score) time = clampTime(score.playingTime((performance.now() - perfOrigin) / 1000));
  playing = false;
  score?.pause();
  if (trajectory) renderFrame(sampleAt(trajectory, time));
}

let loopRunning = false;

function ensureLoop() {
  if (loopRunning) return;
  loopRunning = true;
  requestAnimationFrame(loop);
}

function loop() {
  if (!playing || !trajectory) {
    loopRunning = false;
    return;
  }
  const audioTime = score ? score.playingTime((performance.now() - perfOrigin) / 1000) : (performance.now() - perfOrigin) / 1000;
  time = clampTime(audioTime);
  const frame = sampleAt(trajectory, time);
  renderFrame(frame);
  if (time >= DURATION) {
    playing = false;
    loopRunning = false;
    score?.pause();
    syncControls(frame);
    return;
  }
  requestAnimationFrame(loop);
}

function renderFrame(frame: Frame) {
  insetFrame.hidden = frame.t < 26.15;
  const rect = glCanvas.getBoundingClientRect();
  const inset = frame.t >= 26.15 ? insetView.getBoundingClientRect() : null;
  if (view && !glCanvas.hidden) view.render(frame, reducedMotion, inset, rect, trajectory?.snapTimes ?? []);
  if (!fallbackCanvas.hidden) drawSchematic(fallbackCanvas, frame);
  drawPotential(potentialCanvas);
  if (trajectory) {
    drawForce(forceCanvas, trajectory, frame.t);
    drawEnergy(energyCanvas, { work: frame.work, elastic: frame.elastic, kinetic: frame.kinetic, dissipated: frame.dissipated }, energyScale);
  }
  updateCallouts(frame);
  syncControls(frame);
  adaptQuality();
}

function syncControls(frame: Frame) {
  timeline.value = String(frame.t);
  timeline.setAttribute("aria-valuenow", frame.t.toFixed(2));
  timeline.setAttribute("aria-valuetext", `${frame.t.toFixed(1)} seconds of 34`);
  timeReadout.textContent = `${formatTime(frame.t)} / 00:34.0`;
  const shot = [...SHOTS].reverse().find((item) => frame.t >= item.t) ?? SHOTS[0];
  shotStatus.textContent = shot.name;
  playButton.textContent = playing ? "Pause" : "Play";
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  stateReadout.textContent = `Row coordinates q = ${frame.q.map((q) => q.toFixed(2)).join(", ")}. Actuator force ${frame.force.toFixed(2)}. Specimen compression ${frame.specimenCompression.toFixed(2)}.`;
  phaseNote.textContent = phaseCopy(frame);
  insetNote.textContent = insetCopy(frame);
  axes.hidden = frame.t >= 5;
}

function phaseCopy(frame: Frame): string {
  if (frame.t < 5) return "The array sits between the guided platen and the fixed support. Every operating cell is in State A.";
  if (frame.t < 10) return "The close view shows the continuous curved members. The ghost previews State B without switching the specimen.";
  if (trajectory?.snapTimes.some((snap) => snap > 0 && Math.abs(frame.t - snap) < 0.9)) {
    return "Switching is shown slowly for readability. The visible duration is not a predicted switching time. Coral marks the switch. Energy released in the snap is not treated as heat.";
  }
  if (frame.t < 25) return "Small threshold variations select the sequence. Neighboring rows redistribute the motion while the platen keeps moving.";
  if (frame.t < 28.4) return "External compression is coming off along a path that stays inside the State B basin.";
  return "External compression removed. State B retained. Reduced immediate elastic return through retained configuration and damping.";
}

function insetCopy(frame: Frame): string {
  if (Math.abs(frame.resetForce) > 0.002) return "External trigger required. Reverse actuation is driving the duplicate cell.";
  if (frame.qReset < 0.2) return "Damped settling in State A. Trigger work and released elastic energy are distinct.";
  return "External trigger required. The main array stays in State B.";
}

function updateCallouts(frame: Frame) {
  const items = [
    { text: "Curved elastic cells", anchor: "cell" as const, show: frame.t < 5 },
    { text: "Frame constraints", anchor: "rod" as const, show: frame.t < 5 },
    { text: "Compression direction", anchor: "platen" as const, show: frame.t < 5 },
    { text: "State B preview. Not switched.", anchor: "cell" as const, show: frame.t >= 5.4 && frame.t < 9.6 },
    { text: "Elastic deformation amplified for illustration.", anchor: "cell" as const, show: frame.t >= 10 && frame.t < 16.8 },
    { text: "Small threshold variations select the sequence.", anchor: "platen" as const, show: frame.t >= 17 && frame.t < 25 },
    { text: "State B retained", anchor: "retained" as const, show: frame.t >= 28.2 },
  ].filter((item) => item.show);
  calloutList.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    li.textContent = item.text;
    return li;
  }));
  if (!view || glCanvas.hidden) {
    calloutSvg.replaceChildren();
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  calloutSvg.replaceChildren();
  items.forEach((item, index) => {
    const anchor = view?.anchors[item.anchor];
    if (!anchor || !view) return;
    view.project(anchor, screen);
    if (!screen.visible) return;
    const textWidth = Math.min(340, item.text.length * 6.8);
    let labelX = screen.x + 16;
    let labelY = Math.max(20, screen.y - 26 - index * 4);
    if (item.anchor === "retained") labelX = screen.x - textWidth - 12;
    if (labelX + textWidth > glCanvas.clientWidth - 10) labelX = Math.max(8, glCanvas.clientWidth - textWidth - 10);
    if (labelX < 8) labelX = 8;
    if (labelY > glCanvas.clientHeight - 16) labelY = glCanvas.clientHeight - 16;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(screen.x));
    line.setAttribute("y1", String(screen.y));
    line.setAttribute("x2", String(labelX));
    line.setAttribute("y2", String(labelY));
    line.setAttribute("stroke", "rgba(231,228,220,0.85)");
    line.setAttribute("stroke-width", "1");
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(labelX + 4));
    text.setAttribute("y", String(labelY));
    text.setAttribute("fill", "#E7E4DC");
    text.setAttribute("font-size", "13");
    text.setAttribute("font-family", "Segoe UI, sans-serif");
    text.textContent = item.text;
    calloutSvg.append(line, text);
  });
}

let slowFrames = 0;
let lastStamp = performance.now();
let pixelRatio = Math.min(1.75, window.devicePixelRatio || 1);

function adaptQuality() {
  const now = performance.now();
  const dt = now - lastStamp;
  lastStamp = now;
  if (!view) return;
  if (dt > 34) slowFrames += 1;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 20 && pixelRatio > 1) {
    pixelRatio = 1;
    view.setPixelRatio(1);
    slowFrames = 0;
  }
}

function activateFallback(message: string) {
  glCanvas.hidden = true;
  fallbackCanvas.hidden = false;
  glNote.hidden = false;
  glNote.textContent = message;
}

function showError(message: string) {
  loading.hidden = true;
  errorBox.hidden = false;
  errorBox.textContent = message;
}

function pushGains() {
  score?.setGains(Number(musicInput.value), Number(effectsInput.value), muteButton.getAttribute("aria-pressed") === "true");
}

function formatTime(value: number): string {
  const seconds = clampTime(value);
  return `00:${seconds.toFixed(1).padStart(4, "0")}`;
}

function clampTime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(DURATION, Math.max(0, value));
}

function must<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node as T;
}
