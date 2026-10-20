import * as THREE from "three";
import {
  BAR_THICKNESS,
  DURATION,
  N_ROWS,
  Q_M,
  RESET_FORCE_FACTOR,
  criticalResetForce,
  outwardAmp,
  type Frame,
} from "./sim/physics.ts";

const POLYMER = new THREE.Color("#30445A");
const CYAN = new THREE.Color("#00E5FF");
const CORAL = new THREE.Color("#EF476F");
const SUPPORT = new THREE.Color("#6C7787");
const AMBER = new THREE.Color("#FFB703");
const STATE_B = POLYMER.clone().lerp(CYAN, 0.7);

const CELLS = 3;
const CELL_W = 1.35;
const CELL_GAP = 0.28;
const ATTACH = 0.36;
const BAR_DEPTH = 0.62;
const BEAM_DEPTH = 0.09;
const BEAM_THICK = 0.046;
const STATIONS = 24;
const HALF_BAR = BAR_THICKNESS / 2;

export type Anchors = {
  cell: THREE.Vector3;
  rod: THREE.Vector3;
  platen: THREE.Vector3;
  retained: THREE.Vector3;
};

export type View = {
  render: (frame: Frame, reducedMotion: boolean, inset: DOMRect | null, canvasRect: DOMRect, snapTimes: number[]) => void;
  resize: () => void;
  setPixelRatio: (value: number) => void;
  anchors: Anchors;
  project: (point: THREE.Vector3, out: { x: number; y: number; visible: boolean }) => void;
  dispose: () => void;
};

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  normals: Float32Array;
};

const RESET_PEAK = Math.abs(RESET_FORCE_FACTOR * criticalResetForce());

export function createView(canvas: HTMLCanvasElement): View | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false }) || canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x101219, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101219");
  scene.fog = new THREE.Fog("#101219", 12, 26);
  scene.add(new THREE.HemisphereLight("#c5d0dc", "#1a1e28", 0.72));
  const key = new THREE.DirectionalLight("#f4f7fb", 2.1);
  key.position.set(4.5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#8fb8c9", 0.55);
  rim.position.set(-6, 3, -4);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: "#141820", roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.48;
  scene.add(floor);

  const supportMat = new THREE.MeshStandardMaterial({ color: SUPPORT, roughness: 0.46, metalness: 0.28 });
  const amberMat = new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.42, metalness: 0.12 });
  const rowMats = Array.from({ length: N_ROWS }, () => new THREE.MeshStandardMaterial({
    color: POLYMER,
    roughness: 0.58,
    metalness: 0.06,
    side: THREE.DoubleSide,
  }));
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const clipOn = [clipPlane];

  const pitch = CELL_W + CELL_GAP;
  const span = (CELLS - 1) * pitch;
  const barLength = span + CELL_W + 0.46;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(barLength + 0.8, 0.34, BAR_DEPTH + 0.45), supportMat);
  bottom.position.y = -0.17;
  scene.add(bottom);

  const connectors: THREE.Mesh[] = [];
  for (let i = 0; i < N_ROWS - 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barLength, BAR_THICKNESS, BAR_DEPTH), supportMat);
    scene.add(bar);
    connectors.push(bar);
  }
  const topCap = new THREE.Mesh(new THREE.BoxGeometry(barLength, BAR_THICKNESS, BAR_DEPTH), supportMat);
  scene.add(topCap);
  const platen = new THREE.Mesh(new THREE.BoxGeometry(barLength + 0.55, 0.16, BAR_DEPTH + 0.36), supportMat);
  scene.add(platen);
  const actuator = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.28), amberMat);
  scene.add(actuator);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), 0.72, 0xffb703, 0.16, 0.09);
  scene.add(arrow);

  const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 5.15, 12);
  const rods: THREE.Mesh[] = [];
  for (const x of [-barLength / 2 - 0.08, barLength / 2 + 0.08]) {
    for (const z of [-BAR_DEPTH / 2 - 0.08, BAR_DEPTH / 2 + 0.08]) {
      const rod = new THREE.Mesh(rodGeo, supportMat);
      rod.position.set(x, 2.05, z);
      scene.add(rod);
      rods.push(rod);
    }
  }

  const ribbons: Ribbon[] = [];
  for (let row = 0; row < N_ROWS; row++) {
    for (let cell = 0; cell < CELLS; cell++) {
      for (const side of [-1, 1]) {
        const ribbon = makeRibbon(rowMats[row]);
        scene.add(ribbon.mesh);
        ribbons.push(ribbon);
        ribbon.mesh.userData.cell = cell;
        ribbon.mesh.userData.side = side;
        ribbon.mesh.userData.row = row;
      }
    }
  }

  const ghostMat = new THREE.MeshStandardMaterial({
    color: STATE_B,
    roughness: 0.5,
    metalness: 0.02,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ghosts = [makeRibbon(ghostMat), makeRibbon(ghostMat)];
  ghosts.forEach((ghost) => scene.add(ghost.mesh));

  const sectionLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#f4f1ea" }),
  );
  const sectionPositions = new Float32Array(STATIONS * 3);
  sectionLine.geometry.setAttribute("position", new THREE.BufferAttribute(sectionPositions, 3));
  scene.add(sectionLine);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 50);
  const insetScene = new THREE.Scene();
  insetScene.background = new THREE.Color("#181b24");
  insetScene.add(new THREE.HemisphereLight("#d5dde6", "#20242e", 0.8));
  const insetKey = new THREE.DirectionalLight("#ffffff", 1.8);
  insetKey.position.set(2, 3, 3);
  insetScene.add(insetKey);
  const insetMat = new THREE.MeshStandardMaterial({ color: POLYMER, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const insetBeams = [makeRibbon(insetMat), makeRibbon(insetMat.clone())];
  insetBeams.forEach((beam) => insetScene.add(beam.mesh));
  const insetBarMat = supportMat.clone();
  const insetLower = new THREE.Mesh(new THREE.BoxGeometry(1.15, BAR_THICKNESS, 0.42), insetBarMat);
  const insetUpper = new THREE.Mesh(new THREE.BoxGeometry(1.15, BAR_THICKNESS, 0.42), insetBarMat);
  insetScene.add(insetLower, insetUpper);
  const pusher = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.16), amberMat.clone());
  insetScene.add(pusher);
  const insetCamera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  insetCamera.position.set(1.55, 0.72, 1.7);
  insetCamera.lookAt(0, 0.45, 0);

  const anchors: Anchors = {
    cell: new THREE.Vector3(),
    rod: new THREE.Vector3(),
    platen: new THREE.Vector3(),
    retained: new THREE.Vector3(),
  };
  const look = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const ndc = new THREE.Vector3();

  function resize() {
    const width = Math.max(1, Math.min(canvas.clientWidth, 4096));
    const height = Math.max(1, Math.min(canvas.clientHeight, 4096));
    const aspect = width / height;
    const fov = aspect < 0.9 ? 58 : 38;
    const bufferWidth = Math.floor(width * renderer.getPixelRatio());
    const bufferHeight = Math.floor(height * renderer.getPixelRatio());
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) renderer.setSize(width, height, false);
    if (camera.aspect !== aspect || camera.fov !== fov) {
      camera.aspect = aspect;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function render(frame: Frame, reducedMotion: boolean, inset: DOMRect | null, canvasRect: DOMRect, snapTimes: number[]) {
    resize();
    const section = sectionAmount(frame.t);
    rowMats.forEach((material, row) => {
      material.color.copy(rowColor(frame, row, snapTimes));
      material.clippingPlanes = section > 0.2 ? clipOn : [];
    });
    ghostMat.opacity = ghostOpacity(frame.t);
    ghosts.forEach((ghost) => {
      ghost.mesh.visible = ghostMat.opacity > 0.02;
    });
    sectionLine.visible = section > 0.35;

    connectors.forEach((bar, index) => {
      bar.position.y = frame.y[index + 1];
    });
    topCap.position.y = frame.y[4] - HALF_BAR;
    platen.position.y = frame.yP + 0.08;
    actuator.position.set(0, frame.yP + 0.42, 0);
    const showArrow = frame.t < 5 || (frame.t >= 10 && frame.t < 25);
    arrow.visible = showArrow;
    arrow.position.set(barLength * 0.34, frame.yP + 1.15, 0);

    let ribbonIndex = 0;
    for (let row = 0; row < N_ROWS; row++) {
      const [y0, y1] = beamEnds(frame.y[row], frame.y[row + 1], row);
      const amp = outwardAmp(frame.q[row]);
      for (let cell = 0; cell < CELLS; cell++) {
        const center = (cell - (CELLS - 1) / 2) * pitch;
        for (const side of [-1, 1]) {
          const ribbon = ribbons[ribbonIndex++];
          writeRibbon(ribbon, y0, y1, center + side * ATTACH, side, amp);
        }
      }
    }

    const [gy0, gy1] = beamEnds(frame.y[0], frame.y[1], 0);
    writeRibbon(ghosts[0], gy0, gy1, -ATTACH, -1, outwardAmp(1));
    writeRibbon(ghosts[1], gy0, gy1, ATTACH, 1, outwardAmp(1));
    writeCenterline(sectionPositions, gy0, gy1, -ATTACH, -1, outwardAmp(frame.q[0]));
    sectionLine.geometry.attributes.position.needsUpdate = true;

    anchors.cell.set(-ATTACH, (gy0 + gy1) / 2, 0);
    anchors.rod.set(rods[1].position.x, rods[1].position.y + 1.35, rods[1].position.z);
    anchors.platen.set(barLength * 0.34, frame.yP + 0.7, 0);
    const retainedRow = frame.q.findIndex((q) => q > Q_M);
    const mark = retainedRow >= 0 ? retainedRow : 0;
    anchors.retained.set(ATTACH, (beamEnds(frame.y[mark], frame.y[mark + 1], mark)[0] + beamEnds(frame.y[mark], frame.y[mark + 1], mark)[1]) / 2, 0);

    poseCamera(frame, reducedMotion, camPos, look);
    camera.position.copy(camPos);
    camera.lookAt(look);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    if (inset && frame.t >= 26.15 && frame.t <= DURATION) {
      const height = canvas.clientHeight;
      const x = Math.max(0, Math.round(inset.left - canvasRect.left));
      const yTop = Math.max(0, Math.round(inset.top - canvasRect.top));
      const w = Math.max(2, Math.round(inset.width));
      const h = Math.max(2, Math.round(inset.height));
      const y = Math.max(0, height - yTop - h);
      const insetAmp = outwardAmp(frame.qReset);
      const insetHeight = Math.max(0.42, 0.92 - 0.3 * frame.qReset);
      writeRibbon(insetBeams[0], HALF_BAR, insetHeight, -ATTACH * 0.72, -1, insetAmp);
      writeRibbon(insetBeams[1], HALF_BAR, insetHeight, ATTACH * 0.72, 1, insetAmp);
      insetBeams.forEach((beam) => beam.mesh.material && ((beam.mesh.material as THREE.MeshStandardMaterial).color.copy(insetColor(frame))));
      insetLower.position.y = 0;
      insetUpper.position.y = insetHeight + HALF_BAR;
      const triggered = Math.abs(frame.resetForce) > 0.002;
      pusher.visible = triggered;
      const nudge = triggered ? Math.min(1, Math.abs(frame.resetForce) / RESET_PEAK) : 0;
      pusher.position.set(-ATTACH * 0.72 - 0.34 + nudge * 0.16, insetHeight * 0.5, 0);
      insetCamera.aspect = w / h;
      insetCamera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.clear(true, true, false);
      renderer.render(insetScene, insetCamera);
      renderer.setScissorTest(false);
    }
  }

  return {
    render,
    resize,
    setPixelRatio: (value) => renderer.setPixelRatio(value),
    anchors,
    project: (point, out) => {
      ndc.copy(point).project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      out.x = (ndc.x * 0.5 + 0.5) * width;
      out.y = (-ndc.y * 0.5 + 0.5) * height;
      out.visible = ndc.z > -1 && ndc.z < 1 && out.x >= 0 && out.x <= width && out.y >= 0 && out.y <= height;
    },
    dispose: () => renderer.dispose(),
  };
}

function makeRibbon(material: THREE.Material): Ribbon {
  const positions = new Float32Array(STATIONS * 4 * 3);
  const normals = new Float32Array(STATIONS * 4 * 3);
  const indices: number[] = [];
  for (let i = 0; i < STATIONS - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (const [c, d] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
      indices.push(a + c, a + d, b + d, a + c, b + d, b + c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, positions, normals };
}

const scratchA = { x: 0, y: 0 };
const scratchB = { x: 0, y: 0 };

function writeRibbon(ribbon: Ribbon, y0: number, y1: number, xAttach: number, side: number, amp: number) {
  const gap = Math.max(0.08, y1 - y0);
  const { positions, normals } = ribbon;
  for (let i = 0; i < STATIONS; i++) {
    const s = i / (STATIONS - 1);
    const ds = 0.012;
    pointOnBeam(s, y0, gap, xAttach, side, amp, scratchA);
    pointOnBeam(Math.min(1, s + ds), y0, gap, xAttach, side, amp, scratchB);
    const p0 = scratchA;
    const p1 = scratchB;
    let tx = p1.x - p0.x;
    let ty = p1.y - p0.y;
    const mag = Math.hypot(tx, ty) || 1;
    tx /= mag;
    ty /= mag;
    const nx = -ty;
    const ny = tx;
    const corners = [
      [nx, ny, 1],
      [-nx, -ny, 1],
      [-nx, -ny, -1],
      [nx, ny, -1],
    ];
    for (let c = 0; c < 4; c++) {
      const [cx, cy, cz] = corners[c];
      const o = (i * 4 + c) * 3;
      positions[o] = p0.x + cx * BEAM_THICK * 0.5;
      positions[o + 1] = p0.y + cy * BEAM_THICK * 0.5;
      positions[o + 2] = cz * BEAM_DEPTH * 0.5;
      const nl = Math.hypot(cx, cy, cz) || 1;
      normals[o] = cx / nl;
      normals[o + 1] = cy / nl;
      normals[o + 2] = cz / nl;
    }
  }
  const positionAttr = ribbon.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const normalAttr = ribbon.mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
  positionAttr.needsUpdate = true;
  normalAttr.needsUpdate = true;
}

function writeCenterline(target: Float32Array, y0: number, y1: number, xAttach: number, side: number, amp: number) {
  const gap = Math.max(0.08, y1 - y0);
  for (let i = 0; i < STATIONS; i++) {
    pointOnBeam(i / (STATIONS - 1), y0, gap, xAttach, side, amp, scratchA);
    target[i * 3] = scratchA.x;
    target[i * 3 + 1] = scratchA.y;
    target[i * 3 + 2] = 0;
  }
}

function pointOnBeam(s: number, y0: number, gap: number, xAttach: number, side: number, amp: number, out: { x: number; y: number }) {
  const bow = (1 - Math.cos(Math.PI * 2 * s)) / 2;
  out.x = xAttach + side * amp * bow;
  out.y = y0 + gap * s;
}

function beamEnds(yLower: number, yUpper: number, row: number): [number, number] {
  const start = row === 0 ? 0.012 : yLower + HALF_BAR;
  const end = row === N_ROWS - 1 ? yUpper - BAR_THICKNESS : yUpper - HALF_BAR;
  return [start, Math.max(start + 0.12, end)];
}

function rowColor(frame: Frame, row: number, snapTimes: number[]): THREE.Color {
  const center = snapTimes[row] ?? -1;
  if (center > 0 && frame.t >= center - 0.35 && frame.t <= center + 0.95) return CORAL;
  if (frame.q[row] > Q_M) return STATE_B;
  return POLYMER;
}

function insetColor(frame: Frame): THREE.Color {
  const active = Math.abs(frame.resetForce) > 0.002 || (frame.qReset < 0.92 && frame.qReset > 0.08 && Math.abs(frame.vReset) > 0.05);
  if (active && frame.qReset > 0.08 && frame.qReset < 0.92) return CORAL;
  if (frame.qReset > Q_M) return STATE_B;
  return POLYMER;
}

function ghostOpacity(t: number): number {
  if (t < 5.3 || t > 9.7) return 0;
  if (t < 6.1) return (t - 5.3) / 0.8;
  if (t > 9.0) return (9.7 - t) / 0.7;
  return 1;
}

function sectionAmount(t: number): number {
  return Math.max(window01(t, 6.3, 6.8, 9.15, 9.7), window01(t, 14.7, 15.05, 16.35, 16.9));
}

function window01(t: number, a: number, b: number, c: number, d: number): number {
  if (t <= a || t >= d) return 0;
  if (t < b) return (t - a) / (b - a);
  if (t > c) return (d - t) / (d - c);
  return 1;
}

function poseCamera(frame: Frame, reducedMotion: boolean, position: THREE.Vector3, look: THREE.Vector3) {
  const keys = [
    { t: 0, p: [6.4, 5.5, 7.1], l: [0.1, 1.9, 0] },
    { t: 5, p: [4.4, 2.55, 4.9], l: [0, 0.85, 0] },
    { t: 10, p: [2.2, 1.02, 2.45], l: [0, 0.52, 0] },
    { t: 17, p: [3.55, 1.7, 3.85], l: [0.1, 0.95, 0] },
    { t: 25, p: [5.6, 2.7, 6.5], l: [0, 1.45, 0] },
    { t: 33, p: [4.35, 2.05, 5.35], l: [0.15, 1.28, 0] },
    { t: 34, p: [4.35, 2.05, 5.35], l: [0.15, 1.28, 0] },
  ];
  const pose = reducedMotion ? keys[shotKey(frame.t)] : interpolatePose(keys, frame.t);
  const follow = frame.y[4] * 0.18;
  position.set(pose.p[0], pose.p[1] + follow * 0.25, pose.p[2]);
  look.set(pose.l[0], pose.l[1] + follow, pose.l[2]);
}

function shotKey(t: number): number {
  if (t < 5) return 0;
  if (t < 17) return 2;
  if (t < 25) return 3;
  return 5;
}

function interpolatePose(keys: { t: number; p: number[]; l: number[] }[], t: number) {
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const u = b.t === a.t ? 1 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const s = u * u * (3 - 2 * u);
  return {
    p: a.p.map((value, index) => value + (b.p[index] - value) * s),
    l: a.l.map((value, index) => value + (b.l[index] - value) * s),
  };
}
