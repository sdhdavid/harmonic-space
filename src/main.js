import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLS, ROWS, latticeToWorld, morphPhases } from './lattice.js';
import {
  NOTE_NAMES, mod12, pitchAt, triadNotes, triadName, triadKey,
  TRANSFORMS, TRANSFORM_INFO, parseChord, PROGRESSIONS, SCALES,
} from './theory.js';
import * as audio from './audio.js';

const COLORS = {
  fifth: 0xf2c46d,
  maj3: 0x5fd4c4,
  min3: 0xc78bff,
  major: 0xffa94d,
  minor: 0x6ea8ff,
};

const state = {
  morph: 0,
  morphTarget: 0,
  scale: null, // Set of pitch classes, or null
  hover: null,
  current: null, // current triad
  walk: [], // unwrapped lattice centroids [i, j]
  comet: null,
  follow: false,
};

// ---------- scene ----------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070d);
scene.fog = new THREE.Fog(0x07070d, 30, 75);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 18, 18.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 60;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 14, 10);
scene.add(sun);

{
  const n = 1800;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    v.randomDirection().multiplyScalar(90 + Math.random() * 90);
    pos.set([v.x, v.y, v.z], k * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a8ab0, size: 0.4, fog: false })));
}

const tmp = new THREE.Vector3();
const pitchColor = (pc) => new THREE.Color().setHSL(((pc * 7) % 12) / 12, 0.7, 0.62);

// ---------- notes (nodes) ----------
// Row j = ROWS and column i = COLS duplicate row 0 / column 0; they fade out as the torus closes.
const nodeGeo = new THREE.SphereGeometry(0.26, 24, 16);
const nodes = [];
for (let j = 0; j <= ROWS; j++) {
  for (let i = 0; i <= COLS; i++) {
    const pc = pitchAt(i, j);
    const color = pitchColor(pc);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, transparent: true });
    const mesh = new THREE.Mesh(nodeGeo, mat);
    const el = document.createElement('div');
    el.className = 'note-label';
    el.textContent = NOTE_NAMES[pc];
    el.style.color = `#${color.getHexString()}`;
    const label = new CSS2DObject(el);
    label.position.set(0, 0.55, 0);
    mesh.add(label);
    mesh.userData = { kind: 'node', pc, i, j, pulse: 0, label: el };
    scene.add(mesh);
    nodes.push(mesh);
  }
}

// ---------- chords (triangles) ----------
// Each triangle is subdivided so it can bend smoothly onto the torus.
const TRI_N = 6;
const INSET = 0.88;
const triIndex = [];
{
  const idx = (r, s) => r * (TRI_N + 1) - (r * (r - 1)) / 2 + s;
  for (let r = 0; r < TRI_N; r++) {
    for (let s = 0; s < TRI_N - r; s++) {
      triIndex.push(idx(r, s), idx(r + 1, s), idx(r, s + 1));
      if (s < TRI_N - r - 1) triIndex.push(idx(r + 1, s), idx(r + 1, s + 1), idx(r, s + 1));
    }
  }
}

function triLattice(A, B, C) {
  const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
  const out = [];
  for (let r = 0; r <= TRI_N; r++) {
    for (let s = 0; s <= TRI_N - r; s++) {
      const u = r / TRI_N;
      const v = s / TRI_N;
      const w = 1 - u - v;
      for (let d = 0; d < 2; d++) {
        const p = A[d] * w + B[d] * u + C[d] * v;
        out.push(cen[d] + (p - cen[d]) * INSET);
      }
    }
  }
  return { lat: new Float32Array(out), centroid: cen };
}

const tris = [];
const cellsByKey = new Map();
for (let j = 0; j < ROWS; j++) {
  for (let i = 0; i < COLS; i++) {
    for (const up of [true, false]) {
      const V = up ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j], [i, j + 1], [i + 1, j + 1]];
      const triad = up
        ? { root: pitchAt(i, j), quality: 'major' }
        : { root: mod12(pitchAt(i, j) + 4), quality: 'minor' };
      const { lat, centroid } = triLattice(...V);
      const geo = new THREE.BufferGeometry();
      geo.setIndex(triIndex);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((lat.length / 2) * 3), 3));
      const mat = new THREE.MeshBasicMaterial({
        color: up ? COLORS.major : COLORS.minor,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const key = triadKey(triad);
      mesh.userData = { kind: 'triad', triad, key, lat, pcs: triadNotes(triad) };
      scene.add(mesh);
      tris.push(mesh);
      if (!cellsByKey.has(key)) cellsByKey.set(key, []);
      cellsByKey.get(key).push(centroid);
    }
  }
}

// ---------- interval edges ----------
const EDGE_K = 8;
function makeEdges(segs, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs.length * EDGE_K * 6), 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  line.userData.segs = segs;
  scene.add(line);
  return line;
}
const fifthSegs = [];
const maj3Segs = [];
const min3Segs = [];
for (let j = 0; j <= ROWS; j++) for (let i = 0; i < COLS; i++) fifthSegs.push([i, j, i + 1, j]);
for (let j = 0; j < ROWS; j++) for (let i = 0; i <= COLS; i++) maj3Segs.push([i, j, i, j + 1]);
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) min3Segs.push([i + 1, j, i, j + 1]);
const edges = [
  makeEdges(fifthSegs, COLORS.fifth, 0.55),
  makeEdges(maj3Segs, COLORS.maj3, 0.4),
  makeEdges(min3Segs, COLORS.min3, 0.4),
];

// ---------- walk trail ----------
const TRAIL_MAX = 64;
const TRAIL_SEG = 16;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TRAIL_MAX * TRAIL_SEG + 1) * 3), 3));
const trail = new THREE.Line(
  trailGeo,
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }),
);
trail.renderOrder = 10;
trail.frustumCulled = false;
scene.add(trail);

const comet = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
);
comet.renderOrder = 11;
comet.visible = false;
scene.add(comet);

// ---------- geometry updates ----------
function updateTrail() {
  const arr = trailGeo.attributes.position.array;
  const pts = state.walk;
  let n = 0;
  const put = (i, j) => {
    latticeToWorld(i, j, state.morph, tmp);
    arr[n * 3] = tmp.x;
    arr[n * 3 + 1] = tmp.y;
    arr[n * 3 + 2] = tmp.z;
    n++;
  };
  for (let k = 0; k < pts.length; k++) {
    if (k === 0) {
      put(pts[0][0], pts[0][1]);
      continue;
    }
    const [i0, j0] = pts[k - 1];
    const [i1, j1] = pts[k];
    for (let s = 1; s <= TRAIL_SEG; s++) {
      const t = s / TRAIL_SEG;
      put(i0 + (i1 - i0) * t, j0 + (j1 - j0) * t);
    }
  }
  trailGeo.setDrawRange(0, n);
  trailGeo.attributes.position.needsUpdate = true;
}

function updateGeometry() {
  const m = state.morph;
  for (const n of nodes) latticeToWorld(n.userData.i, n.userData.j, m, n.position);
  for (const t of tris) {
    const { lat } = t.userData;
    const pos = t.geometry.attributes.position;
    for (let k = 0; k < lat.length / 2; k++) {
      latticeToWorld(lat[k * 2], lat[k * 2 + 1], m, tmp);
      pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
    }
    pos.needsUpdate = true;
    t.geometry.computeBoundingSphere();
  }
  for (const line of edges) {
    const arr = line.geometry.attributes.position.array;
    let o = 0;
    for (const [i0, j0, i1, j1] of line.userData.segs) {
      for (let k = 0; k < EDGE_K; k++) {
        for (const t of [k / EDGE_K, (k + 1) / EDGE_K]) {
          latticeToWorld(i0 + (i1 - i0) * t, j0 + (j1 - j0) * t, m, tmp);
          arr[o++] = tmp.x;
          arr[o++] = tmp.y;
          arr[o++] = tmp.z;
        }
      }
    }
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
  updateTrail();
}

// ---------- walking ----------
// Pick the copy of the triad closest to where the walk currently is (wrapping around the torus).
function nearestCentroid(triad, prev) {
  const ref = prev ?? [COLS / 2, ROWS / 2];
  const range = prev ? [-1, 0, 1] : [0];
  let best = null;
  let bestD = Infinity;
  for (const [ci, cj] of cellsByKey.get(triadKey(triad))) {
    for (const a of range) {
      for (const b of range) {
        const i = ci + a * COLS;
        const j = cj + b * ROWS;
        const di = i - ref[0];
        const dj = j - ref[1];
        const d = (di + dj / 2) ** 2 + (dj * 0.866) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
  }
  return best;
}

function pulsePc(pc, amount = 1) {
  for (const n of nodes) if (n.userData.pc === pc) n.userData.pulse = Math.max(n.userData.pulse, amount);
}

function goToTriad(triad, { dur } = {}) {
  const prev = state.walk.at(-1) ?? null;
  const c = nearestCentroid(triad, prev);
  state.walk.push(c);
  if (state.walk.length > TRAIL_MAX) state.walk.shift();
  state.current = triad;
  state.comet = { from: prev ?? c, to: c, t0: performance.now() };
  const pcs = triadNotes(triad);
  for (const pc of pcs) pulsePc(pc, 0.8);
  audio.playTriad(pcs, triad.root, dur);
  updateTrail();
  updateHud();
}

function clearWalk() {
  state.walk = [];
  state.current = null;
  state.comet = null;
  updateTrail();
  updateHud();
}

function move(k) {
  if (!state.current) return;
  stopProgression();
  goToTriad(TRANSFORMS[k](state.current));
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const chordNameEl = $('chordName');
const chordNotesEl = $('chordNotes');
const moveBtns = [...document.querySelectorAll('#hud .moves button')];

for (const btn of moveBtns) {
  btn.title = TRANSFORM_INFO[btn.dataset.move];
  btn.addEventListener('click', () => move(btn.dataset.move));
}

function updateHud() {
  const t = state.current;
  if (!t) {
    chordNameEl.textContent = '—';
    chordNotesEl.textContent = 'Click a triangle to start walking';
  } else {
    chordNameEl.textContent = `${NOTE_NAMES[t.root]} ${t.quality}`;
    chordNotesEl.textContent = triadNotes(t).map((n) => NOTE_NAMES[n]).join(' · ');
  }
  for (const btn of moveBtns) {
    btn.disabled = !t;
    btn.querySelector('.to').textContent = t ? `→ ${triadName(TRANSFORMS[btn.dataset.move](t))}` : '·';
  }
}
updateHud();

const panel = $('panel');
$('togglePanel').addEventListener('click', () => {
  panel.classList.toggle('collapsed');
  $('togglePanel').textContent = panel.classList.contains('collapsed') ? '+' : '–';
});
if (window.innerWidth < 700) $('togglePanel').click();

// Keep the scene centred in the space to the right of the panel on wide screens.
function applyViewOffset() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const off = w >= 700 && !panel.classList.contains('collapsed') ? (panel.offsetWidth + 16) / 2 : 0;
  if (off) camera.setViewOffset(w, h, -off, 0, w, h);
  else camera.clearViewOffset();
}
$('togglePanel').addEventListener('click', applyViewOffset);
applyViewOffset();

const morphInput = $('morph');
morphInput.addEventListener('input', () => {
  state.morph = state.morphTarget = Number(morphInput.value);
  updateGeometry();
});
$('toPlane').addEventListener('click', () => (state.morphTarget = 0));
$('toTorus').addEventListener('click', () => (state.morphTarget = 1));

// Scale
const scaleRoot = $('scaleRoot');
const scaleType = $('scaleType');
NOTE_NAMES.forEach((n, pc) => scaleRoot.add(new Option(n, pc)));
for (const [id, s] of Object.entries(SCALES)) scaleType.add(new Option(s.name, id));
function updateScale() {
  const { intervals } = SCALES[scaleType.value];
  const root = Number(scaleRoot.value);
  state.scale = intervals ? new Set(intervals.map((x) => mod12(root + x))) : null;
}
scaleRoot.addEventListener('change', updateScale);
scaleType.addEventListener('change', updateScale);
$('playScale').addEventListener('click', () => {
  const intervals = SCALES[scaleType.value].intervals ?? [0, 2, 4, 5, 7, 9, 11];
  const root = Number(scaleRoot.value);
  [...intervals, 12].forEach((x, k) => {
    setTimeout(() => {
      audio.playMidi(60 + root + x, 0.5);
      pulsePc(mod12(root + x));
    }, k * 220);
  });
});

// Progressions
const progSelect = $('progSelect');
const progPlay = $('progPlay');
const progChips = $('progChips');
const progNote = $('progNote');
const tempo = $('tempo');
PROGRESSIONS.forEach((p, k) => progSelect.add(new Option(p.name, k)));

function renderChips(activeIdx = -1) {
  const p = PROGRESSIONS[progSelect.value];
  progChips.innerHTML = '';
  p.chords.split(' ').forEach((name, k) => {
    const t = parseChord(name);
    const chip = document.createElement('span');
    chip.className = `chip ${t.quality}${k === activeIdx ? ' active' : ''}`;
    chip.textContent = triadName(t);
    progChips.appendChild(chip);
  });
  progNote.textContent = p.note;
}
renderChips();
progSelect.addEventListener('change', () => {
  stopProgression();
  renderChips();
});
tempo.addEventListener('input', () => ($('tempoVal').textContent = tempo.value));

let progTimer = null;
function stopProgression() {
  if (progTimer === null) return;
  clearTimeout(progTimer);
  progTimer = null;
  progPlay.textContent = '▶ Play';
  renderChips();
}
function playProgression() {
  stopProgression();
  const chords = PROGRESSIONS[progSelect.value].chords.split(' ').map(parseChord);
  clearWalk();
  let k = 0;
  const step = () => {
    if (k >= chords.length) {
      stopProgression();
      return;
    }
    const beat = 60 / Number(tempo.value);
    renderChips(k);
    goToTriad(chords[k], { dur: beat * 2 * 0.95 });
    k++;
    progTimer = setTimeout(step, beat * 2 * 1000);
  };
  progPlay.textContent = '■ Stop';
  progTimer = 0;
  step();
}
progPlay.addEventListener('click', () => (progTimer === null ? playProgression() : stopProgression()));

$('follow').addEventListener('change', (e) => (state.follow = e.target.checked));
$('mute').addEventListener('change', (e) => audio.setMuted(e.target.checked));
$('clearWalk').addEventListener('click', () => {
  stopProgression();
  clearWalk();
});

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey) return;
  const k = e.key.toUpperCase();
  if (k === 'P' || k === 'L' || k === 'R') move(k);
  else if (k === 'T') state.morphTarget = state.morphTarget > 0.5 ? 0 : 1;
  else if (k === 'C') {
    stopProgression();
    clearWalk();
  } else if (e.key === ' ') {
    e.preventDefault();
    progTimer === null ? playProgression() : stopProgression();
  }
});

// ---------- picking ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = $('tooltip');

function pick(ev) {
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [...nodes.filter((n) => n.visible), ...tris];
  return raycaster.intersectObjects(targets, false)[0]?.object ?? null;
}

const canvas = renderer.domElement;
canvas.addEventListener('pointermove', (e) => {
  const obj = pick(e);
  state.hover = obj;
  canvas.style.cursor = obj ? 'pointer' : '';
  if (!obj) {
    tooltip.style.opacity = 0;
    return;
  }
  const d = obj.userData;
  tooltip.textContent =
    d.kind === 'node'
      ? `${NOTE_NAMES[d.pc]} — click to play`
      : `${NOTE_NAMES[d.triad.root]} ${d.triad.quality} · ${d.pcs.map((n) => NOTE_NAMES[n]).join(' ')}`;
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
  tooltip.style.opacity = 1;
});
canvas.addEventListener('pointerleave', () => {
  state.hover = null;
  tooltip.style.opacity = 0;
});

let downPos = null;
canvas.addEventListener('pointerdown', (e) => (downPos = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 6) return;
  const obj = pick(e);
  if (!obj) return;
  if (obj.userData.kind === 'node') {
    audio.playMidi(60 + obj.userData.pc);
    pulsePc(obj.userData.pc);
  } else {
    stopProgression();
    goToTriad(obj.userData.triad);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  applyViewOffset();
});

// ---------- frame loop ----------
const cometLat = [0, 0];
const followDelta = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const diff = state.morphTarget - state.morph;
  if (Math.abs(diff) > 1e-4) {
    state.morph += Math.sign(diff) * Math.min(Math.abs(diff), dt / 2.2);
    morphInput.value = state.morph;
    updateGeometry();
    // Zoom in as the wide plane closes into the compact torus.
    const zoom = (26 - 10 * state.morph) / camera.position.distanceTo(controls.target);
    camera.position.sub(controls.target).multiplyScalar(1 + (zoom - 1) * Math.min(1, dt * 4)).add(controls.target);
  }
  const { roll, bend } = morphPhases(state.morph);
  const currentKey = state.current ? triadKey(state.current) : null;
  const currentPcs = state.current ? triadNotes(state.current) : [];

  for (const t of tris) {
    const d = t.userData;
    let target = 0.06;
    if (state.scale && d.pcs.every((pc) => state.scale.has(pc))) target = 0.18;
    if (state.hover === t) target = Math.max(target, 0.32);
    if (d.key === currentKey) target = 0.62;
    t.material.opacity += (target - t.material.opacity) * Math.min(1, dt * 10);
  }

  const dCenter = camera.position.distanceTo(controls.target);
  for (const n of nodes) {
    const d = n.userData;
    d.pulse *= Math.exp(-dt * 3);
    const seamFade = (d.i === COLS ? 1 - bend : 1) * (d.j === ROWS ? 1 - roll : 1);
    n.visible = seamFade > 0.02;
    if (!n.visible) continue;
    const inScale = !state.scale || state.scale.has(d.pc);
    const inChord = currentPcs.includes(d.pc);
    n.material.opacity = seamFade * (inScale ? 1 : 0.25);
    n.material.emissiveIntensity = (inScale ? 0.5 : 0.08) + (inChord ? 0.4 : 0) + d.pulse * 1.5;
    n.scale.setScalar((inScale ? 1 : 0.7) * (inChord ? 1.25 : 1) * (1 + 0.5 * d.pulse));
    const depthFade = Math.min(1, Math.max(0.12, 1 - (camera.position.distanceTo(n.position) - dCenter) / 5));
    d.label.style.opacity = (depthFade * seamFade * (inScale ? 1 : 0.3)).toFixed(2);
  }

  if (state.comet) {
    const { from, to, t0 } = state.comet;
    const u = Math.min(1, (now - t0) / 380);
    const e = u * u * (3 - 2 * u);
    cometLat[0] = from[0] + (to[0] - from[0]) * e;
    cometLat[1] = from[1] + (to[1] - from[1]) * e;
    latticeToWorld(cometLat[0], cometLat[1], state.morph, comet.position);
    comet.scale.setScalar(1 + 0.25 * Math.sin(now / 180));
    comet.visible = true;
    if (state.follow) {
      followDelta.copy(comet.position).sub(controls.target).multiplyScalar(Math.min(1, dt * 2.5));
      controls.target.add(followDelta);
      camera.position.add(followDelta);
    }
  } else {
    comet.visible = false;
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

updateGeometry();
requestAnimationFrame(frame);
// Start flat, then roll the map up into a torus.
setTimeout(() => (state.morphTarget = 1), 1200);
