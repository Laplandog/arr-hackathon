// 龙蛋 + 星座：两种“长期进度”，都只看“完成了阶段”，不看用力程度、音量、时长。
//   星座：胸廓扩张时每口深吸气（吸满停一下）从 Mochi 头顶飞起一个光点，点亮天上的一颗星；全部点亮后连成一颗蛋的形状。
//   龙蛋：每完成一轮，星光落到小窝里的龙蛋上，蛋暖一格（冰凉 → 微暖发光 → 轻轻晃动 → 出现裂纹）；全部完成后在 END 孵化。
//   进度永远不倒退：暂停、提前结束都保留；只有“重新开始”回到冰凉、星星全灭。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PLANE, trimTexturesUnion } from './layout.js';
import { canvasTexture } from './assets.js';
import { Tween, Seq, ease, lerp, rand, bezier, depthOrder, DEG } from './util.js';

const TAU = Math.PI * 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function quad(tex, { additive = false, color = 0xffffff } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return new THREE.Mesh(PLANE, mat);
}

// ───────────── 代码生成的贴图（美术图缺失时的兜底 + 光效） ─────────────
export const eggGen = {
  glow: () => canvasTexture(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)');
    gr.addColorStop(0.65, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  beam: () => canvasTexture(64, 256, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,.45)');
    v.addColorStop(0.9, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const hz = g.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(0, 0, w, h);
  }),
  line: () => canvasTexture(8, 32, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.3, 'rgba(255,255,255,.9)');
    v.addColorStop(0.7, 'rgba(255,255,255,.9)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }),
  /** 没有美术图时画一个简单的蛋（cold / warm / crack） */
  egg: (kind) => () => canvasTexture(256, 320, (g, w, h) => {
    const warm = kind !== 'cold';
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TAU;
      g.lineTo(w / 2 + w * 0.42 * Math.sin(t) * (1 - 0.13 * Math.cos(t)), h * 0.52 - h * 0.44 * Math.cos(t));
    }
    g.fillStyle = warm ? '#f8dcb0' : '#c9d4ec'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#f6ecd4'; g.stroke();
    g.fillStyle = warm ? '#f2a25e' : '#a6b5de';
    for (const [x, y, r] of [[0.35, 0.3, 0.07], [0.62, 0.5, 0.09], [0.42, 0.7, 0.1]]) { g.beginPath(); g.arc(x * w, y * h, r * w, 0, TAU); g.fill(); }
    if (kind === 'crack') {
      g.beginPath();
      for (let i = 0; i <= 10; i++) g.lineTo(w * (0.1 + i * 0.08), h * (0.46 + (i % 2 ? 0.04 : -0.03)));
      g.lineWidth = 4; g.strokeStyle = '#6b3f2a'; g.stroke();
    }
  }),
};

// ───────────── 龙蛋 ─────────────
export class Egg {
  /** tx: { cold, warm, crack, top, bottom }（tryLoadTexture 的结果，可缺 top/bottom） */
  constructor(parent, tx, { glowTex, beamTex, sparks, audio }) {
    const E = CONFIG.egg;
    this.sparks = sparks; this.audio = audio;
    this.group = new THREE.Group(); this.group.name = 'egg';
    this.body = new THREE.Group();           // 晃动绕蛋底转
    this.topPivot = new THREE.Group();       // 上半壳绕裂缝转
    this.group.add(this.body); this.body.add(this.topPivot);
    parent.add(this.group);

    const keys = ['cold', 'warm', 'crack', 'bottom', 'top'];
    const list = keys.map((k) => tx[k]).filter(Boolean);
    const tr = list.every((t) => !t.procedural) ? trimTexturesUnion(list) : null; // 五张同一块画布，用同一个裁切框
    const size = tr || list[0];
    this.aspect = size.w / size.h;
    this.m = {};
    for (const k of keys) {
      if (!tx[k]) continue;
      const q = quad(tx[k].tex); q.name = `egg_${k}`;
      (k === 'top' ? this.topPivot : this.body).add(q);
      this.m[k] = q;
    }
    this.hasShells = !!(this.m.top && this.m.bottom);
    this.glow = quad(glowTex, { additive: true, color: E.glow.color });
    this.inner = quad(glowTex, { additive: true, color: E.inner.color });
    this.beam = quad(beamTex, { additive: true, color: E.beam.color });
    this.group.add(this.glow, this.inner, this.beam);
    this.warmT = new Tween(0); this.crackT = new Tween(0); this.glowT = new Tween(0); this.beamT = new Tween(0);
    this.innerT = new Tween(0); this.flashT = new Tween(0); this.fadeT = new Tween(1);
    this.h = E.h;
    this.reset();
  }

  applyLayout(s) {
    this.h = s.egg.h;
    this.group.position.copy(s.egg.pos);
    this._place();
  }
  _place() {
    const h = this.h, w = h * this.aspect;
    for (const k of ['cold', 'warm', 'crack', 'bottom']) {
      const q = this.m[k]; if (!q) continue;
      q.position.set(0, h / 2, 0); q.scale.set(w, h, 1);
    }
    const cy = h * (1 - CONFIG.egg.crackFromTop); // 裂缝离蛋底的高度
    this.topPivot.position.set(0, cy, 0); this.topPivot.rotation.set(0, 0, 0);
    if (this.m.top) { this.m.top.position.set(0, h / 2 - cy, 0); this.m.top.scale.set(w, h, 1); }
  }

  get stageName() { return CONFIG.egg.stageNames[this.stage] || ''; }
  /** 蛋中心（world 组本地坐标） */
  center(out = new THREE.Vector3()) { return out.copy(this.group.position).setY(this.group.position.y + this.h * 0.5); }
  /** 孵化时光团待的位置：蛋的右上方 */
  besidePos(out = new THREE.Vector3()) { return out.copy(this.group.position).add(new THREE.Vector3(...CONFIG.egg.orbOffset)).setY(this.group.position.y + this.h + CONFIG.egg.orbOffset[1]); }

  reset() {
    const E = CONFIG.egg;
    this.stage = 0; this.target = 0; this.hatched = false; this.hatching = false; this.popped = false;
    this.seq = null; this.beamSeq = null;
    this.warmT.set(0); this.crackT.set(0); this.glowT.set(E.glow.byStage[0]); this.beamT.set(0);
    this.innerT.set(0); this.flashT.set(0); this.fadeT.set(1);
    this.wobT = 0; this.wobAge = 99; this.wobDeg = 0; this.shiver = 0;
    this.body.rotation.set(0, 0, 0);
    if (this.m.cold) this.m.cold.visible = true;
    for (const k of ['top', 'bottom']) if (this.m[k]) this.m[k].visible = false;
    this._place();
  }

  /** 暖一格（0 冰凉 · 1 微暖发光 · 2 轻轻晃动 · 3 出现裂纹）。只会往前走。 */
  setStage(n) {
    const E = CONFIG.egg;
    n = Math.max(0, Math.min(3, n | 0));
    if (n <= this.stage || this.hatched) return false;
    this.stage = n;
    this.warmT.go(n >= 1 ? 1 : 0, E.stageFadeSec);
    this.crackT.go(n >= 3 ? 1 : 0, E.stageFadeSec);
    this.glowT.go(E.glow.byStage[n], E.stageFadeSec);
    this.flashT.set(1).go(0, 1.4, ease.outQuad);
    this._beam();
    this.sparks.burst(this.center(), 22, { speed: 0.4, up: 0.2, life: [0.7, 1.3], size: [0.015, 0.035], spread: 0.08, colors: ['#fff2b0', '#ffd27a', '#ffffff'], grav: 0.04 });
    this.wobAge = 0; this.wobT = 0; this.wobDeg = Math.max(3, E.wobble.deg[n] || 0);
    this.audio?.play('sfx_egg_warm');
    return true;
  }

  _beam() {
    const B = CONFIG.egg.beam;
    this.beamSeq = new Seq([
      { dur: B.inSec, update: (p) => { this.beamT.v = ease.outQuad(p); } },
      { dur: B.holdSec },
      { dur: B.outSec, update: (p) => { this.beamT.v = 1 - ease.inOutSine(p); } },
    ], () => { this.beamSeq = null; this.beamT.v = 0; });
  }

  /** 孵化：先使劲晃，再“啪”地裂开 —— 上半壳飞起落到旁边，里面透出暖光（孵出什么先留悬念）。返回总时长。 */
  hatch(onPop) {
    if (this.hatched) return 0;
    const E = CONFIG.egg, H = E.hatch;
    if (this.stage < 3) { this.stage = 3; this.warmT.go(1, 0.3); this.crackT.go(1, 0.3); }
    this.hatched = true;
    this.glowT.go(E.glow.byStage[3] * 1.3, H.shakeSec);
    const cy = this.h * (1 - E.crackFromTop);
    const land = new THREE.Vector3(H.landX, -cy + H.landY, 0.02);
    const up = new THREE.Vector3(H.landX * 0.45, H.popUp, 0.02);
    this.seq = new Seq([
      { dur: H.shakeSec, update: (p) => {
        const k = 0.35 + 0.65 * p;
        this.body.rotation.z = H.shakeDeg * DEG * k * Math.sin(p * TAU * H.shakes);
      }, end: () => { this.body.rotation.z = 0; } },
      { dur: 0, start: () => this._pop(onPop) },
      { dur: H.popSec, update: (p) => {
        if (!this.hasShells) return;
        bezier(new THREE.Vector3(0, 0, 0.02), up, land, ease.outSine(p), this.topPivot.position);
        this.topPivot.position.y += cy;
        this.topPivot.rotation.z = H.restDeg * DEG * ease.inOutSine(p);
      } },
    ], () => { this.seq = null; });
    return H.shakeSec + H.popSec;
  }
  _pop(onPop) {
    const E = CONFIG.egg;
    this.stage = 4; this.popped = true;
    if (this.hasShells) {
      this.m.top.visible = true; this.m.bottom.visible = true;
    } else {
      this.fadeT.go(0, 0.6); // 没有上下壳的图：蛋淡出成一团光
    }
    this.innerT.go(1, 0.35, ease.outQuad);
    this.flashT.set(1.6).go(0, 1.8, ease.outQuad);
    this.glowT.go(E.glow.byStage[4], 0.8);
    const c = this.center();
    c.y += this.h * 0.1;
    this.sparks.burst(c, 46, { speed: 0.75, up: 0.35, life: [0.9, 1.7], size: [0.02, 0.05], spread: 0.08, colors: ['#fff6c8', '#ffd36b', '#ffb36b', '#ffffff'], grav: -0.02, drag: 1.3 });
    this.audio?.play('sfx_hatch');
    onPop?.();
  }

  update(dt, t) {
    const E = CONFIG.egg;
    for (const tw of [this.warmT, this.crackT, this.glowT, this.innerT, this.flashT, this.fadeT]) tw.update(dt);
    this.seq?.update(dt); this.beamSeq?.update(dt);
    const h = this.h, fade = this.fadeT.v;
    // 冷色蛋一直垫在最下面（不透明），暖色、裂纹叠在上面淡入 → 交叉时不会透出后面
    if (this.m.cold) this.m.cold.material.opacity = fade;
    const shellsOut = this.popped && this.hasShells; // 裂开以后只显示上下两半壳
    if (this.m.cold) this.m.cold.visible = !shellsOut;
    if (this.m.warm) { this.m.warm.material.opacity = this.warmT.v * fade; this.m.warm.visible = !shellsOut && this.warmT.v > 0.002; }
    if (this.m.crack) { this.m.crack.material.opacity = this.crackT.v * fade; this.m.crack.visible = !shellsOut && this.crackT.v > 0.002; }
    // 第 2、3 格：隔一会儿轻轻晃一下（孵化时由 hatch 控制）
    if (!this.seq && !this.hatched) {
      const W = E.wobble, every = W.everySec[this.stage] || 0;
      if (every > 0 && (this.wobT += dt) >= every) { this.wobT = 0; this.wobAge = 0; this.wobDeg = W.deg[this.stage]; }
      this.wobAge += dt;
      const p = this.wobAge / W.sec;
      this.body.rotation.z = p < 1 ? this.wobDeg * DEG * Math.sin(p * TAU * 2) * (1 - p) : 0;
      if (this.shiver) this.body.rotation.z += Math.sin(t * 47) * 2 * DEG * this.shiver; // 冷得发抖（新手引导“暖暖龙蛋”）
    }
    // 光：蛋后面的暖光（呼吸起伏）+ 变暖时一闪 + 孵化后壳里透出的光
    const G = E.glow;
    const pulse = 1 + G.pulseAmp * Math.sin((t * TAU) / G.pulseSec);
    const gs = h * G.size * (1 + 0.25 * this.flashT.v);
    this.glow.position.set(0, h * 0.5, -0.02);
    this.glow.scale.set(gs, gs, 1);
    this.glow.material.opacity = Math.min(1, this.glowT.v * pulse + this.flashT.v * 0.6);
    this.glow.visible = this.glow.material.opacity > 0.003;
    const is = h * E.inner.size * (1 + 0.08 * Math.sin(t * 3.1));
    this.inner.position.set(0, h * 0.62, -0.01);
    this.inner.scale.set(is, is, 1);
    this.inner.material.opacity = this.innerT.v * (0.85 + 0.15 * Math.sin(t * 2.3));
    this.inner.visible = this.innerT.v > 0.003;
    const B = E.beam;
    this.beam.position.set(0, h * 0.35 + B.height / 2, 0.03);
    this.beam.scale.set(B.width, B.height, 1);
    this.beam.material.opacity = this.beamT.v * B.opacity;
    this.beam.visible = this.beamT.v > 0.003;
    // 排序：蛋在 Mochi 前、小窝前片后面
    const base = depthOrder(this.group.position.z);
    this.glow.renderOrder = base - 0.06; this.inner.renderOrder = base - 0.04;
    const order = { cold: 0, warm: 0.01, crack: 0.02, bottom: 0.03, top: 0.04 };
    for (const [k, q] of Object.entries(this.m)) q.renderOrder = base + order[k];
    this.beam.renderOrder = base + 0.05;
  }
}

// ───────────── 星座 ─────────────
export class Constellation {
  constructor(parent, { starTexes, slotTex, glowTex, lineTex, sparks, audio }) {
    this.parent = parent; this.starTexes = starTexes; this.slotTex = slotTex; this.glowTex = glowTex; this.lineTex = lineTex;
    this.sparks = sparks; this.audio = audio;
    this.group = new THREE.Group(); this.group.name = 'constellation';
    parent.add(this.group);
    const C = CONFIG.constellation;
    this.fill = quad(glowTex, { additive: true, color: C.fillColor });
    this.group.add(this.fill);
    this.stars = []; this.lines = []; this.flying = []; this.headPool = [];
    this.fillT = new Tween(0); this.pulseT = new Tween(0);
    this.total = 0; this.lit = 0; this.complete = false; this.completeIn = -1;
    this.cfg = { center: new THREE.Vector3(...C.center), w: C.w, h: C.h };
  }

  applyLayout(s) {
    this.cfg = s.constellation;
    this.group.position.copy(this.cfg.center);
    // 整片星座正对孩子的眼睛
    const dir = new THREE.Vector3(0, s.eyeHeight, 0).sub(this.cfg.center).normalize();
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.group.updateMatrix();
    if (this.total) this._layout();
  }

  /** 重新开始：total 颗星（= 轮数 × 每轮深呼吸次数），全部熄灭 */
  reset(total) {
    for (const st of this.stars) this.group.remove(st.slot, st.on, st.halo);
    for (const ln of this.lines) this.group.remove(...ln.segs);
    for (const f of this.flying) { f.m.visible = false; this.headPool.push(f.m); }
    this.flying = [];
    this.total = Math.max(1, total | 0);
    this.lit = 0; this.complete = false; this.completeIn = -1;
    this.fillT.set(0); this.pulseT.set(0);
    const C = CONFIG.constellation;
    this.stars = Array.from({ length: this.total }, (_, i) => {
      const slot = quad(this.slotTex || this.glowTex, { color: C.slotColor });
      const on = quad(this.starTexes[i % this.starTexes.length]);
      const halo = quad(this.glowTex, { additive: true, color: C.haloColor });
      on.visible = false; halo.visible = false;
      this.group.add(slot, on, halo);
      return { slot, on, halo, state: 'off', litT: new Tween(0), ph: rand(0, TAU), sz: 1 + 0.18 * Math.sin(i * 2.7) };
    });
    // 第 i 条线连 i → i+1；最后一条（N-1 → 0）在全部点亮时把蛋形闭合。
    // 每条线沿蛋形的弧线分几小段画（只连直线的话 6 颗星看起来像六边形，不像蛋）
    const K = C.lineSegments;
    this.lines = Array.from({ length: this.total > 1 ? this.total : 0 }, (_, i) => {
      const segs = Array.from({ length: K }, () => { const m = quad(this.lineTex, { color: C.lineColor }); m.visible = false; this.group.add(m); return m; });
      return { segs, a: i, b: (i + 1) % this.total, grow: new Tween(0) };
    });
    this._layout();
  }

  /** 蛋形轮廓：th = 0 在顶上，按 th 减小的方向走（从左下开始，沿左边往上、绕过顶、从右边下来） */
  _curve(th, jx = 0, jy = 0, out = new THREE.Vector3()) {
    const C = CONFIG.constellation, { w, h } = this.cfg;
    return out.set(-(w / 2) * Math.sin(th) * (1 - C.taper * Math.cos(th)) + jx, (h / 2) * Math.cos(th) + jy, 0);
  }
  _layout() {
    const C = CONFIG.constellation, N = this.total, { w, h } = this.cfg;
    this.th = Array.from({ length: N }, (_, i) => Math.PI - ((i + 0.5) * TAU) / N);
    this.jit = Array.from({ length: N }, (_, i) => [C.jitter * w * Math.sin(i * 12.9898), C.jitter * h * Math.sin(i * 78.233)]);
    this.pts = this.th.map((th, i) => this._curve(th, ...this.jit[i]));
    this.stars.forEach((st, i) => { for (const m of [st.slot, st.on, st.halo]) m.position.copy(this.pts[i]); st.halo.position.z = -0.01; st.on.position.z = 0.01; });
  }
  /** 第 a 颗到第 b 颗之间弧线上的点（u: 0 → 1） */
  _arc(a, b, u, out) {
    let tb = this.th[b];
    if (tb > this.th[a]) tb -= TAU; // 闭合的最后一段跨过 2π
    const ja = this.jit[a], jb = this.jit[b];
    return this._curve(lerp(this.th[a], tb, u), lerp(ja[0], jb[0], u), lerp(ja[1], jb[1], u), out);
  }

  /** 第 i 颗星在 world 组本地坐标里的位置 */
  starPos(i, out = new THREE.Vector3()) {
    this.group.updateMatrix();
    return out.copy(this.pts[i]).applyMatrix4(this.group.matrix);
  }
  centerPos(out = new THREE.Vector3()) { return out.copy(this.group.position); }

  /** 点亮第 i 颗：从 from（Mochi 头顶）飞上去一个光点，到了才亮。重复调用（暂停后重来）不会重复点亮。 */
  light(i, from) {
    const st = this.stars[i];
    if (!st || st.state !== 'off') return false;
    st.state = 'flying';
    this._spark(from, this.starPos(i), CONFIG.constellation.sparkSec, () => this._lit(i));
    return true;
  }

  /** 从星座中心飞下来一道星光（去龙蛋） */
  comet(to, onArrive, dur = CONFIG.constellation.cometSec) {
    const from = this.complete || this.lit === 0 ? this.centerPos() : this.starPos(this._lastLit());
    this._spark(from, to, dur, onArrive, { size: 1.5, arc: -0.4 });
  }
  _lastLit() { for (let i = this.total - 1; i >= 0; i--) if (this.stars[i].state === 'on') return i; return 0; }

  _spark(from, to, dur, onArrive, { size = 1, arc = CONFIG.constellation.sparkArc } = {}) {
    const C = CONFIG.constellation;
    // 光点用普通混合的金色（灰天空上加法发光看不清），拖尾用加法小光点
    const m = this.headPool.pop() || (() => { const q = quad(this.glowTex, { color: C.sparkColor }); this.parent.add(q); return q; })();
    m.visible = true;
    const c = from.clone().lerp(to, 0.5); c.y += arc * from.distanceTo(to) * 0.25;
    this.flying.push({ m, from: from.clone(), c, to: to.clone(), t: 0, dur, onArrive, size, acc: 0 });
  }

  _lit(i) {
    const C = CONFIG.constellation, st = this.stars[i];
    st.state = 'on'; this.lit++;
    st.on.visible = true; st.halo.visible = true;
    st.litT.set(0).go(1, 0.55, ease.outBack);
    const p = this.starPos(i), d = p.length();
    this.sparks.burst(p, 16, { speed: 0.05 * d, up: 0.01 * d, life: [0.6, 1.1], size: [0.006 * d, 0.012 * d], spread: 0.01 * d, colors: ['#fff6c8', '#ffd36b', '#ffffff'], grav: 0, drag: 2 });
    this.audio?.play('sfx_star');
    if (i > 0 && this.stars[i - 1].state === 'on') this.lines[i - 1]?.grow.go(1, C.lineSec, ease.outSine);
    if (i < this.total - 1 && this.stars[i + 1].state === 'on') this.lines[i]?.grow.go(1, C.lineSec, ease.outSine);
    if (this.lit >= this.total) this.completeIn = C.lineSec;
  }
  _complete() {
    const C = CONFIG.constellation;
    this.complete = true;
    if (this.total > 2) this.lines[this.total - 1]?.grow.go(1, C.lineSec, ease.outSine);
    this.fillT.go(1, 1.6, ease.inOutSine);
    this.pulseT.set(1).go(0, 1.6, ease.outQuad);
    this.audio?.play('sfx_constellation');
  }

  update(dt, t) {
    const C = CONFIG.constellation;
    this.fillT.update(dt); this.pulseT.update(dt);
    if (this.completeIn >= 0 && (this.completeIn -= dt) < 0) this._complete();
    const base = depthOrder(this.group.position.z);
    const pulse = this.pulseT.v;
    this.stars.forEach((st, i) => {
      const k = st.litT.update(dt);
      const tw = 1 + 0.07 * Math.sin(t * 1.9 + st.ph);
      const ss = C.slotSize * st.sz * tw;
      st.slot.scale.set(ss, ss, 1);
      st.slot.rotation.z = 0.15 * Math.sin(t * 0.5 + st.ph);
      st.slot.material.opacity = C.slotOpacity * (1 - Math.min(1, k));
      st.slot.visible = st.slot.material.opacity > 0.003;
      if (st.on.visible) {
        const ls = C.litSize * st.sz * Math.max(0, k) * (1 + 0.05 * Math.sin(t * 2.3 + st.ph) + 0.35 * pulse);
        st.on.scale.set(ls, ls, 1);
        st.on.rotation.z = 0.12 * Math.sin(t * 0.8 + st.ph);
        const hs = ls * C.haloScale;
        st.halo.scale.set(hs, hs, 1);
        st.halo.material.opacity = Math.min(1, (0.55 + 0.15 * Math.sin(t * 2.1 + st.ph) + 0.6 * pulse + 0.2 * this.fillT.v) * Math.min(1, k));
      }
      st.halo.renderOrder = base - 0.1; st.slot.renderOrder = base; st.on.renderOrder = base + 0.05;
    });
    for (const ln of this.lines) {
      const g = ln.grow.update(dt), K = ln.segs.length;
      const op = C.lineOpacity * (0.85 + 0.15 * Math.sin(t * 1.4 + ln.a));
      ln.segs.forEach((m, k) => {
        const u0 = k / K, u1 = Math.min(g, (k + 1) / K);
        m.visible = u1 > u0 + 1e-4;
        if (!m.visible) return;
        const a = this._arc(ln.a, ln.b, u0, _a), b = this._arc(ln.a, ln.b, u1, _b);
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, -0.005);
        m.rotation.z = Math.atan2(dy, dx);
        m.scale.set(len + C.lineWidth * 0.5, C.lineWidth, 1); // 稍微加长一点，接缝处不断开
        m.material.opacity = op;
        m.renderOrder = base - 0.05;
      });
    }
    this.fill.position.set(0, 0, -0.02);
    this.fill.scale.set(this.cfg.w * C.fillScale, this.cfg.h * C.fillScale, 1);
    this.fill.material.opacity = this.fillT.v * C.fillOpacity * (0.85 + 0.15 * Math.sin(t * 1.3));
    this.fill.visible = this.fillT.v > 0.003;
    this.fill.renderOrder = base - 0.3;
    // 飞行中的光点：大小按离眼睛的距离换算（看起来一样大），拖一串小光点
    let head = null;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const p = Math.min(1, f.t / f.dur);
      bezier(f.from, f.c, f.to, ease.inOutSine(p), f.m.position);
      const d = _a.copy(f.m.position).setY(f.m.position.y - 1.1).length();
      const s = C.sparkAngular * d * f.size * (1 + 0.15 * Math.sin(t * 20));
      f.m.scale.set(s, s, 1);
      f.m.material.opacity = 1;
      f.m.renderOrder = depthOrder(f.m.position.z, 0.95);
      head = f.m.position;
      f.acc += dt * C.trailRate;
      while (f.acc >= 1) {
        f.acc -= 1;
        _b.set(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(0.12 * s);
        this.sparks.emit({ pos: f.m.position.clone().add(_b), vel: [0, -0.02 * d, 0], life: rand(0.35, 0.7), size: s * rand(0.25, 0.45), color: i % 2 ? '#ffe7a0' : '#fff6d8', drag: 2 });
      }
      if (p >= 1) {
        f.m.visible = false; this.headPool.push(f.m); this.flying.splice(i, 1);
        f.onArrive?.();
      }
    }
    // 拖尾粒子跟着当前光点排序；没有光点时排在星座的深度
    this.sparks.mesh.renderOrder = head ? depthOrder(head.z, 0.9) : base + 0.1;
  }
}
