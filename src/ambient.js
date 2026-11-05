// 小动静：纸鸟、蝴蝶、飘浮的蒲公英种子 —— 都跟着进度出现，世界“醒过来”的感觉。
//   纸鸟：哪一边恢复颜色，就有鸟从那边的小岛飞起来，之后在那一侧的天上慢慢来回飞；结尾放晴时再从远处飞来一只。
//   蝴蝶：主岛的花开了以后，两只蝴蝶在花丛前面扑扇。
//   种子：孩子身边一直有几颗慢慢往上飘的小种子；开场是灰的（像瞌睡的灰尘），越往后越暖、越多。
// 都很小、很慢、离得不近，没有大面积运动（防晕）。CONFIG.ambient.enabled = false 可以整个关掉。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PLANE } from './layout.js';
import { canvasTexture } from './assets.js';
import { Tween, ease, lerp, rand, bezier, depthOrder, DEG } from './util.js';

const TAU = Math.PI * 2;
const EYE = 1.1;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

function quad(tex, color = 0xffffff) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(PLANE, mat);
  m.rotation.order = 'YXZ';
  return m;
}
/** 朝向孩子（只绕竖轴转） */
const faceYaw = (p) => Math.atan2(-p.x, -p.z);

export const ambientGen = {
  seed: () => canvasTexture(64, 64, (g) => {
    // 蒲公英种子：一把细绒毛 + 小茎 + 种子
    g.strokeStyle = 'rgba(255,252,240,.95)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const a = (-165 + i * 15) * DEG;
      g.beginPath(); g.moveTo(32, 24); g.lineTo(32 + Math.cos(a) * 19, 24 + Math.sin(a) * 19); g.stroke();
      g.fillStyle = 'rgba(255,255,250,.9)'; g.beginPath(); g.arc(32 + Math.cos(a) * 19, 24 + Math.sin(a) * 19, 1.6, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(235,225,205,.95)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(32, 24); g.lineTo(32, 48); g.stroke();
    g.fillStyle = 'rgba(196,160,120,1)'; g.beginPath(); g.ellipse(32, 51, 2.6, 4.2, 0, 0, TAU); g.fill();
  }),
};

// ───────────── 纸鸟 ─────────────
class Bird {
  constructor(parent, frames, aspect, cfg) {
    this.cfg = cfg; this.frames = frames; this.aspect = aspect;
    this.mesh = quad(frames[0], cfg.tint || 0xffffff);
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.facing = new Tween(1); this.alpha = new Tween(0);
    this.reset();
  }
  reset() {
    this.state = 'idle'; this.wait = -1; this.t = 0; this.cruiseT = 0;
    this.mesh.visible = false; this.alpha.set(0); this.facing.set(1);
    this.ph0 = rand(0, TAU); this.flapPh = rand(0, 10);
    this.pos = new THREE.Vector3(); this.prev = null;
  }
  /** 在 delay 秒后从 from 起飞（from 为 null：从画面外远处飞进来） */
  launch(from, delay = 0) {
    if (this.state !== 'idle') return;
    this.state = 'waiting'; this.wait = delay; this.from = from?.clone() || null;
  }
  _pathPos(time, out) {
    const C = this.cfg, ph = (time * TAU) / C.periodSec + this.ph0;
    const az = lerp(C.az[0], C.az[1], 0.5 - 0.5 * Math.cos(ph)) * DEG;
    const el = (C.el[0] + C.el[1] * Math.sin(ph * 2.3)) * DEG;
    return out.set(C.r * Math.sin(az), EYE + C.r * Math.tan(el), -C.r * Math.cos(az));
  }
  _start() {
    const A = CONFIG.ambient.birdTakeoff;
    this.state = 'takeoff'; this.t = 0;
    this.p1 = this._pathPos(0, new THREE.Vector3());
    if (!this.from) { // 从更远、更偏的地方飞进来
      const a = (this.cfg.az[1] + 25) * DEG, r = this.cfg.r * 1.4;
      this.from = new THREE.Vector3(r * Math.sin(a), this.p1.y + 1.5, -r * Math.cos(a));
    }
    this.c = this.from.clone().lerp(this.p1, 0.5); this.c.y = Math.max(this.from.y, this.p1.y) + A.arc;
    this.mesh.visible = true; this.alpha.set(0).go(1, A.fadeSec);
  }
  update(dt, t) {
    if (this.state === 'idle') return;
    if (this.state === 'waiting') { if ((this.wait -= dt) <= 0) this._start(); else return; }
    const A = CONFIG.ambient;
    this.t += dt;
    let flapping;
    if (this.state === 'takeoff') {
      const p = Math.min(1, this.t / A.birdTakeoff.sec);
      bezier(this.from, this.c, this.p1, ease.inOutSine(p), this.pos);
      flapping = true;
      if (p >= 1) { this.state = 'cruise'; this.cruiseT = 0; }
    } else {
      this.cruiseT += dt;
      this._pathPos(this.cruiseT, this.pos);
      // 扇几下翅膀，再滑翔一会儿
      const cyc = (this.cruiseT + this.flapPh) % (A.flapRun + A.glideSec);
      flapping = cyc < A.flapRun;
    }
    // 往哪边飞就朝哪边（纸片翻面）
    if (this.prev) {
      _v.copy(this.pos).sub(this.prev);
      const yaw = faceYaw(this.pos);
      const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw); // 朝向孩子的图面上的“右”
      const sideways = _v.x * rightX + _v.z * rightZ;
      if (Math.abs(sideways) > 1e-4) { const want = sideways > 0 ? 1 : -1; if (this.facing.to !== want) this.facing.go(want, 0.3); }
    }
    this.prev = (this.prev || new THREE.Vector3()).copy(this.pos);
    this.facing.update(dt); this.alpha.update(dt);
    const frame = flapping ? (Math.floor((t + this.flapPh) * A.flapHz * 2) % 2) : 1;
    this.mesh.material.map = this.frames[frame];
    const s = this.cfg.size;
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.sin((t + this.flapPh) * 2.1) * 0.03 * s;
    this.mesh.rotation.set(0, faceYaw(this.pos), 0);
    this.mesh.scale.set(s * this.facing.v, s * this.aspect, 1);
    this.mesh.material.opacity = this.alpha.v;
    this.mesh.renderOrder = depthOrder(-Math.hypot(this.pos.x, this.pos.z), 0.5);
  }
}

// ───────────── 蝴蝶 ─────────────
class Butterfly {
  constructor(parent, tex, aspect, cfg) {
    this.cfg = cfg; this.aspect = aspect;
    this.mesh = quad(tex);
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.alpha = new Tween(0); this.grow = new Tween(0);
    this.reset();
  }
  reset() { this.state = 'idle'; this.wait = -1; this.t = 0; this.mesh.visible = false; this.alpha.set(0); this.grow.set(0); this.ph = rand(0, TAU); }
  show(center, delay = 0) {
    if (this.state !== 'idle') return;
    this.state = 'waiting'; this.wait = delay; this.center = center.clone();
  }
  update(dt, t) {
    if (this.state === 'idle') return;
    if (this.state === 'waiting') {
      if ((this.wait -= dt) > 0) return;
      this.state = 'fly'; this.t = 0; this.mesh.visible = true;
      this.alpha.go(1, 0.6); this.grow.go(1, 1.4, ease.outSine);
    }
    const C = this.cfg, A = CONFIG.ambient;
    this.t += dt; this.alpha.update(dt); const g = this.grow.update(dt);
    const w = (this.t * TAU) / C.periodSec + this.ph;
    const p = this.mesh.position;
    // 从花丛里飞出来（grow 0→1），之后绕着花丛画 8 字
    p.set(
      this.center.x + C.rx * Math.sin(w) * g,
      this.center.y + C.lift * g + C.ry * Math.sin(2 * w + 0.7) * g + Math.sin(t * TAU * A.butterflyFlapHz * 0.5 + this.ph) * 0.012,
      this.center.z + 0.12 + C.rz * (0.5 + 0.5 * Math.cos(w)) * g,
    );
    const flap = 0.22 + 0.78 * Math.abs(Math.cos(t * Math.PI * A.butterflyFlapHz + this.ph));
    const s = C.size * (0.6 + 0.4 * g);
    this.mesh.rotation.set(-0.35, faceYaw(p), 0.25 * Math.cos(w));
    this.mesh.scale.set(s * flap, s * this.aspect, 1);
    this.mesh.material.opacity = this.alpha.v;
    this.mesh.renderOrder = depthOrder(p.z, 0.4);
  }
}

// ───────────── 飘浮的种子 ─────────────
class Seeds {
  constructor(parent, tex) {
    const S = CONFIG.ambient.seeds;
    this.n = S.count;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(PLANE, mat, this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = depthOrder(-1.25, 0.9);
    parent.add(this.mesh);
    this.gray = new THREE.Color(S.grayColor); this.warm = new THREE.Color(S.warmColor); this.col = new THREE.Color();
    this.items = Array.from({ length: this.n }, () => this._spawn({}, true));
    this.progress = new Tween(0);
  }
  _spawn(it, anywhere = false) {
    const S = CONFIG.ambient.seeds;
    it.az = rand(S.az[0], S.az[1]) * DEG; it.r = rand(S.rMin, S.rMax);
    it.y = anywhere ? rand(S.yMin, S.yMax) : S.yMin; it.vy = rand(...S.rise);
    it.size = rand(...S.size); it.ph = rand(0, TAU); it.spin = rand(-0.6, 0.6);
    it.k = rand(0, 1); // 进度到多少才出现（开场只有一小部分）
    return it;
  }
  update(dt, t) {
    const S = CONFIG.ambient.seeds;
    const pr = this.progress.update(dt);
    const shown = lerp(S.grayCount / S.count, 1, pr);
    this.col.copy(this.gray).lerp(this.warm, pr);
    this.items.forEach((it, i) => {
      it.y += it.vy * dt;
      if (it.y > S.yMax) this._spawn(it);
      const span = S.yMax - S.yMin, u = (it.y - S.yMin) / span;
      const fade = Math.min(1, u / 0.12, (1 - u) / 0.12);
      const on = it.k <= shown ? 1 : 0;
      const sway = Math.sin(t * 0.7 + it.ph) * S.sway;
      const a = it.az + sway / it.r;
      _v.set(it.r * Math.sin(a), it.y, -it.r * Math.cos(a));
      _e.set(0, faceYaw(_v), Math.sin(t * 0.9 + it.ph) * 0.4 + it.spin);
      _q.setFromEuler(_e);
      const s = it.size * Math.max(0, fade) * on;
      _m.compose(_v, _q, _s.set(s, s, 1));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, this.col);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  reset() { this.progress.set(0); this.items.forEach((it) => this._spawn(it, true)); }
}

// ───────────── 总入口 ─────────────
export class Ambient {
  /** tx: { birds: [frame1, frame2], butterflies: [...] }（tryLoadTexture 的结果；缺图就不放鸟/蝴蝶） */
  constructor(parent, layout, tx) {
    const A = CONFIG.ambient;
    this.layout = layout; this.enabled = A.enabled;
    this.birds = []; this.butterflies = []; this.seeds = null;
    this.melted = new Set(); this.cleared = false;
    if (!this.enabled) return;
    const bf = tx.birds?.filter(Boolean) || [];
    if (bf.length === 2) {
      const aspect = bf[0].h / bf[0].w;
      this.birds = A.birds.map((c) => new Bird(parent, bf.map((r) => r.tex), aspect, c));
    }
    const bt = tx.butterflies?.filter(Boolean) || [];
    if (bt.length) this.butterflies = A.butterflies.map((c, i) => new Butterfly(parent, bt[(c.tex ?? i) % bt.length].tex, bt[0].h / bt[0].w, c));
    this.seeds = new Seeds(parent, ambientGen.seed());
  }
  _islandTop(key) {
    const L = this.layout.get(key);
    return L ? L.base.clone().add(new THREE.Vector3(0, L.w * L.aspect * 0.32, 0)) : null;
  }
  /** 第 i 个区域恢复颜色 */
  onZone(i) {
    if (!this.enabled || this.melted.has(i)) return;
    this.melted.add(i);
    for (const b of this.birds) if (b.cfg.zone === i) b.launch(this._islandTop(b.cfg.from), b.cfg.delay ?? 1.2);
    for (const f of this.butterflies) {
      if (f.cfg.zone !== i) continue;
      const L = this.layout.get(f.cfg.at);
      if (L) f.show(L.base, f.cfg.delay ?? 1.6);
    }
    this._progress();
  }
  /** 结尾放晴 */
  onClear() {
    if (!this.enabled) return;
    this.cleared = true;
    for (const b of this.birds) if (b.cfg.zone === 'end') b.launch(null, b.cfg.delay ?? 0.8);
    this._progress();
  }
  _progress() {
    if (!this.seeds) return;
    const p = Math.min(1, (this.melted.size / 4) * 0.75 + (this.cleared ? 0.25 : 0));
    this.seeds.progress.go(p, 2.5);
  }
  reset() {
    this.melted.clear(); this.cleared = false;
    for (const b of this.birds) b.reset();
    for (const f of this.butterflies) f.reset();
    this.seeds?.reset();
  }
  update(dt, t) {
    if (!this.enabled) return;
    for (const b of this.birds) b.update(dt, t);
    for (const f of this.butterflies) f.update(dt, t);
    this.seeds?.update(dt, t);
  }
}
