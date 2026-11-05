// 特效（尽量用代码生成，不依赖图片）：光团、送星星、雾融化、灰彩恢复、舒适带、火苗、Zzz、天空放晴、保护膜
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadOrProcedural, canvasTexture, tryLoadTexture } from './assets.js';
import { PLANE, sharedBright, trimTexture, trimTexturesUnion } from './layout.js';
import { Tween, Seq, Scheduler, ease, lerp, rand, bezier, depthOrder, vec3, DEG } from './util.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

// ───────────── 代码生成的贴图 ─────────────
const gen = {
  dot: () => canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  orbCore: () => canvasTexture(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,250,1)'); gr.addColorStop(0.4, 'rgba(255,240,190,.95)');
    gr.addColorStop(0.7, 'rgba(255,214,130,.45)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  orbGlow: () => canvasTexture(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,220,150,.55)'); gr.addColorStop(0.45, 'rgba(255,190,110,.18)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  star: () => canvasTexture(128, 128, (g, w) => {
    const c = w / 2;
    const glow = g.createRadialGradient(c, c, 0, c, c, c);
    glow.addColorStop(0, 'rgba(255,240,170,.8)'); glow.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, w);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? w * 0.17 : w * 0.4, a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#ffe27a'; g.strokeStyle = '#fff6d0'; g.lineWidth = 4; g.lineJoin = 'round';
    g.fill(); g.stroke();
  }),
  zzz: () => canvasTexture(128, 128, (g, w) => {
    g.font = `800 ${w * 0.8}px "Comic Sans MS", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(80,70,120,.55)'; g.strokeText('Z', w / 2, w / 2 + 4);
    g.fillStyle = '#f4f0ff'; g.fillText('Z', w / 2, w / 2 + 4);
  }),
  flame: (k) => () => canvasTexture(128, 128, (g, w) => {
    // 指向 +x 的小火苗（泪滴形），三帧形状略有不同
    const wob = [0, 0.06, -0.05][k];
    const gr = g.createRadialGradient(w * 0.62, w * 0.5, 2, w * 0.5, w * 0.5, w * 0.48);
    gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.35, 'rgba(255,210,90,.95)');
    gr.addColorStop(0.75, 'rgba(255,130,60,.75)'); gr.addColorStop(1, 'rgba(255,100,60,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(w * 0.96, w * (0.5 + wob));
    g.bezierCurveTo(w * 0.7, w * (0.12 + wob), w * 0.18, w * 0.2, w * 0.12, w * 0.5);
    g.bezierCurveTo(w * 0.18, w * 0.8, w * 0.7, w * (0.88 + wob), w * 0.96, w * (0.5 + wob));
    g.fill();
  }),
  band: () => canvasTexture(256, 64, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const hz = g.createLinearGradient(0, 0, w, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.2, 'rgba(0,0,0,1)'); hz.addColorStop(0.8, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(0, 0, w, h);
  }),
};

function quad(tex, { additive = false, color = 0xffffff, side = THREE.DoubleSide } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, depthWrite: false, side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return new THREE.Mesh(PLANE, mat);
}

// ───────────── 粒子（一个 InstancedMesh = 一次 draw call） ─────────────
class Particles {
  constructor(parent, tex, cap = 256) {
    this.cap = cap;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(PLANE, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0; this.mesh.visible = false;
    parent.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  emit({ pos, vel = [0, 0, 0], life = 1, size = 0.03, color = '#ffe0a0', drag = 1.5, grav = 0, grow = 0.5 }) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({
      pos: pos.clone(), vel: Array.isArray(vel) ? new THREE.Vector3(...vel) : vel.clone(),
      life, age: 0, size, color: new THREE.Color(color), drag, grav, grow,
    });
  }
  burst(center, n, { speed = 0.35, up = 0.25, life = [0.8, 1.4], size = [0.02, 0.045], colors = ['#ffe0a0'], spread = 0.1, grav = 0.05, drag = 1.6 } = {}) {
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-0.6, 0.6)).normalize().multiplyScalar(speed * rand(0.4, 1));
      dir.y += up;
      const p = center.clone().add(new THREE.Vector3(rand(-spread, spread), rand(-spread, spread) * 0.6, rand(-spread, spread) * 0.3));
      this.emit({ pos: p, vel: dir, life: rand(...life), size: rand(...size), color: colors[i % colors.length], grav, drag });
    }
  }
  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
    }
    for (const p of L) {
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y += p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.age / p.life;
      const a = Math.min(1, p.age / 0.12) * Math.pow(1 - k, 1.2);
      const s = p.size * (1 + p.grow * k);
      this._m.compose(p.pos, this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c.copy(p.color).multiplyScalar(a));
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
  clear() { this.list.length = 0; }
}

// ───────────── 光团小精灵（家长的化身） ─────────────
class Orb {
  /** coreArt = true：美术的纸片光团（不透明），用普通混合、不染色；代码画的光团用加法混合发光 */
  constructor(parent, coreTex, glowTex, trail, { coreArt = false, coreAspect = 1, glowArt = false, glowAspect = 1 } = {}) {
    const O = CONFIG.orb;
    this.group = new THREE.Group(); this.group.name = 'orb';
    this.coreAspect = coreAspect; this.glowAspect = glowAspect;
    this.glow = quad(glowTex, { additive: true, color: glowArt ? 0xffffff : O.glowColor });
    this.core = quad(coreTex, { additive: !coreArt, color: coreArt ? 0xffffff : O.color });
    this.group.add(this.glow, this.core);
    parent.add(this.group);
    this.trail = trail;
    this.pos = vec3(O.farPos); this.rest = new THREE.Vector3();
    this.seq = null; this.boost = new Tween(1); this.baseBoost = new Tween(1);
    this.trailAcc = 0; this._last = this.pos.clone();
  }
  setRest(v) { this.rest.copy(v); }
  _fly(to, dur, { arc = 0.22, e = ease.inOutSine } = {}) {
    let p0, c;
    const target = to.clone ? to.clone() : to;
    return {
      dur,
      start: () => { p0 = this.pos.clone(); c = p0.clone().lerp(target, 0.5); c.y += arc; },
      update: (p) => bezier(p0, c, target, e(p), this.pos),
    };
  }
  _run(steps, onDone) { this.seq?.cancel(); this.seq = new Seq(steps, () => { this.seq = null; onDone?.(); }); }
  placeFar() { this.seq?.cancel(); this.seq = null; this.pos.copy(vec3(CONFIG.orb.farPos)); this.baseBoost.set(1); this.boost.set(1); }
  toRest(dur = 1.0) { this.baseBoost.go(1, 0.6); this._run([this._fly(this.rest, dur)]); }
  flyAway() { this.baseBoost.go(1, 0.6); this._run([this._fly(vec3(CONFIG.orb.farPos), 1.4, { arc: 0.5 })]); }

  /** 从远处飞来，绕 Mochi 转一圈打招呼，再回到待机位置 */
  greet(center) {
    const G = CONFIG.orb.greet, r = G.radius;
    const c = center.clone();
    const startPt = c.clone().add(new THREE.Vector3(r, 0.12, 0));
    this.baseBoost.go(1, 0.6);
    this._run([
      this._fly(startPt, G.approachSec, { arc: 0.45, e: ease.outCubic }),
      { dur: G.circleSec, update: (p) => {
        const a = ease.inOutSine(p) * TAU;
        this.pos.set(c.x + r * Math.cos(a), c.y + 0.12 + 0.06 * Math.sin(2 * a), c.z - r * Math.sin(a));
      } },
      this._fly(this.rest, G.toRestSec),
    ]);
    return G.approachSec + G.circleSec + G.toRestSec;
  }
  greetDuration() { const G = CONFIG.orb.greet; return G.approachSec + G.circleSec + G.toRestSec; }

  /** 飞到 Mochi 头顶，放出星星，飞回 */
  sendStar(headTop, stars, onLand) {
    const S = CONFIG.orb.star;
    const above = headTop.clone().add(new THREE.Vector3(0, S.aboveHead, 0.04));
    this._run([
      this._fly(above, S.flySec, { arc: 0.15 }),
      { dur: 0, start: () => stars.drop(this.pos.clone(), headTop, S.dropSec, onLand) },
      { dur: S.dropSec * 0.6 },
      this._fly(this.rest, S.returnSec),
    ]);
    return S.flySec + S.dropSec;
  }
  flash() {
    const F = CONFIG.orb.flash;
    this.boost.go(F.boost, F.sec * 0.3, ease.outQuad, () => this.boost.go(1, F.sec * 0.7, ease.inOutSine));
  }
  /** 暂停：飞到 Mochi 身边，变亮靠着它 */
  snuggle(mochiPos) {
    const O = CONFIG.orb;
    this.baseBoost.go(O.snuggleBoost, 0.6);
    this._run([this._fly(mochiPos.clone().add(vec3(O.snuggleOffset)), O.snuggleSec, { arc: 0.12 })]);
  }
  /** END：飞到 Mochi 身边发暖光 */
  endGlow(mochiPos) {
    const O = CONFIG.orb;
    this.baseBoost.go(O.endBoost, 1.5);
    this._run([this._fly(mochiPos.clone().add(vec3(O.endOffset)), 1.2, { arc: 0.15 })]);
  }
  /** P1 喷嚏：在 Mochi 鼻子前轻轻晃一下 */
  wiggleAt(nose, onDone) {
    const p = nose.clone().add(new THREE.Vector3(0.1, 0.02, 0.08));
    this._run([
      this._fly(p, 0.6, { arc: 0.1 }),
      { dur: 0.6, start: () => { this._wig = this.pos.clone(); }, update: (k) => { this.pos.x = this._wig.x + Math.sin(k * TAU * 3) * 0.035; } },
      { dur: 0, start: () => onDone?.() },
      this._fly(this.rest, 0.9),
    ]);
  }
  update(dt, t) {
    const O = CONFIG.orb;
    this.seq?.update(dt);
    this.boost.update(dt); this.baseBoost.update(dt);
    const bob = this.seq ? 0 : Math.sin(t * TAU / O.bobPeriod) * O.bobAmp;
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    const k = this.boost.v * this.baseBoost.v;
    const breath = 1 + O.glowBreathAmp * Math.sin(t * TAU / O.glowBreathPeriod);
    const gs = O.glowSize * breath * (0.75 + 0.25 * k);
    this.glow.scale.set(gs, gs * this.glowAspect, 1);
    this.glow.material.opacity = Math.min(1, 0.75 * k);
    const cs = O.coreSize * (0.85 + 0.15 * k);
    this.core.scale.set(cs, cs * this.coreAspect, 1);
    this.core.material.opacity = 1;
    const ro = depthOrder(this.pos.z, 0.7);
    this.glow.renderOrder = ro; this.core.renderOrder = ro + 0.01;
    // 拖尾小光点
    const moved = _v.copy(this.pos).sub(this._last).length();
    this._last.copy(this.pos);
    this.trail.mesh.renderOrder = ro - 0.02;
    if (moved > 0.0015) {
      this.trailAcc += dt * O.trailRate;
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        this.trail.emit({ pos: this.pos.clone().add(new THREE.Vector3(rand(-0.02, 0.02), rand(-0.02, 0.02), 0)), vel: [rand(-0.03, 0.03), rand(0, 0.05), 0], life: rand(0.4, 0.8), size: rand(0.015, 0.03), color: '#ffd890', drag: 2 });
      }
    }
  }
}

// ───────────── 星星（光团送给 Mochi） ─────────────
class Stars {
  constructor(parent, texes, sparks, audio) {
    this.parent = parent; this.texes = texes; this.sparks = sparks; this.audio = audio;
    this.pool = []; this.active = []; this.nextTex = 0;
  }
  drop(from, to, dur, onLand) {
    const m = this.pool.pop() || (() => { const q = quad(this.texes[0]); this.parent.add(q); return q; })();
    m.material.map = this.texes[this.nextTex++ % this.texes.length]; // 每次换一种颜色
    m.visible = true;
    const size = CONFIG.orb.star.size;
    this.audio?.play('sfx_star');
    const it = { m, t: 0, from: from.clone(), to: to.clone(), dur, onLand, landed: false, flashT: 0, size };
    this.active.push(it);
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.t += dt;
      const { m } = it;
      if (!it.landed) {
        const p = Math.min(1, it.t / it.dur);
        m.position.lerpVectors(it.from, it.to, ease.inQuad(p));
        m.rotation.z = p * Math.PI * 1.5;
        m.scale.setScalar(it.size * (0.7 + 0.3 * p));
        m.material.opacity = 1;
        if (p >= 1) {
          it.landed = true; it.t = 0;
          this.sparks.burst(it.to, 14, { speed: 0.4, up: 0.15, life: [0.5, 0.9], size: [0.015, 0.03], colors: ['#fff2a8', '#ffd36b', '#ffffff'] });
          it.onLand?.();
        }
      } else {
        const p = Math.min(1, it.t / 0.35);
        m.position.copy(it.to);
        m.scale.setScalar(it.size * (1 + 0.9 * ease.outQuad(p)));
        m.material.opacity = 1 - p;
        if (p >= 1) { m.visible = false; this.pool.push(m); this.active.splice(i, 1); }
      }
      m.renderOrder = depthOrder(m.position.z, 0.9);
    }
  }
  clear() { for (const it of this.active) { it.m.visible = false; this.pool.push(it.m); } this.active = []; }
}

// ───────────── 火苗 ─────────────
class Flames {
  constructor(parent, frames, additive, sparks, aspect = 1) {
    this.parent = parent; this.frames = frames; this.additive = additive; this.sparks = sparks; this.aspect = aspect;
    this.pool = []; this.active = [];
  }
  /** 从 from 飞到 to；demo=true 时只飞一小段就化成小光点（示范，不融雾） */
  shoot(from, to, { dur = CONFIG.flame.travelSec, demo = false, onArrive } = {}) {
    const F = CONFIG.flame;
    let target = to.clone();
    const d = target.clone().sub(from);
    if (demo) target = from.clone().add(d.setLength(F.demoDistance));
    const m = this.pool.pop() || (() => { const q = quad(this.frames[0], { additive: this.additive }); this.parent.add(q); return q; })();
    m.material.map = this.frames[0];
    m.visible = true;
    const dx = target.x - from.x, dy = target.y - from.y;
    const ang = Math.abs(dx) + Math.abs(dy) > 0.05 ? Math.atan2(dy, dx) : Math.PI / 2;
    m.rotation.z = ang - F.artAngleDeg * DEG;
    this.active.push({ m, t: 0, from: from.clone(), to: target, dur: demo ? dur * 0.7 : dur, demo, onArrive, arrived: false, frameT: 0, frame: 0 });
  }
  update(dt) {
    const F = CONFIG.flame;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.t += dt; it.frameT += dt;
      const { m } = it;
      const artGrow = F.mode === 'grow' && !this.additive; // 美术的三帧本身就是从小到大
      if (artGrow) {
        const f = Math.min(this.frames.length - 1, Math.floor(it.t / F.frameSec));
        if (f !== it.frame) { it.frame = f; m.material.map = this.frames[f]; }
      } else if (it.frameT >= F.frameSec) { it.frameT = 0; it.frame = (it.frame + 1) % this.frames.length; m.material.map = this.frames[it.frame]; }
      const p = Math.min(1, it.t / it.dur);
      m.position.lerpVectors(it.from, it.to, ease.outQuad(p));
      const grow = artGrow ? 1 : Math.min(1, p * 3);
      const s = F.size * (0.55 + 0.45 * grow) * (it.demo ? 1 - 0.4 * p : 1);
      m.scale.set(s, s * this.aspect, 1);
      m.material.opacity = p < 0.8 ? 1 : (1 - p) / 0.2;
      m.renderOrder = depthOrder(m.position.z, 0.85);
      if (Math.random() < dt * F.embers) this.sparks.emit({ pos: m.position.clone(), vel: [rand(-0.05, 0.05), rand(0.02, 0.1), 0], life: rand(0.3, 0.6), size: rand(0.012, 0.022), color: '#ffb35a', drag: 2 });
      if (!it.arrived && p >= 0.85) {
        it.arrived = true;
        if (it.demo) this.sparks.burst(it.to, 10, { speed: 0.2, up: 0.1, life: [0.4, 0.8], size: [0.012, 0.025], colors: ['#ffd27a', '#fff1b8'] });
        it.onArrive?.();
      }
      if (p >= 1) { m.visible = false; this.pool.push(m); this.active.splice(i, 1); }
    }
  }
  clear() { for (const it of this.active) { it.m.visible = false; this.pool.push(it.m); } this.active = []; }
}

// ───────────── 舒适带 ─────────────
class Band {
  constructor(parent, tex, procedural, sparks) {
    const B = CONFIG.band;
    this.mesh = quad(tex, { additive: procedural, color: procedural ? B.color : 0xffffff });
    this.mesh.name = 'comfort_band';
    parent.add(this.mesh);
    this.sparks = sparks;
    this.op = new Tween(0); this.bright = new Tween(0);
    this.s = null;
  }
  apply(s) {
    this.s = s.band;
    this.mesh.position.set(s.band.x, s.band.center, s.band.z);
    this.mesh.scale.set(s.band.w, Math.max(0.02, s.band.yMax - s.band.yMin), 1);
    this.mesh.renderOrder = depthOrder(s.band.z, -0.5);
  }
  show(on) { this.op.go(on ? 1 : 0, CONFIG.band.fadeSec); }
  setBright(on) {
    this.bright.go(on ? 1 : 0, 0.4);
    if (on && this.s) { // 悬停时闪几颗小星
      for (let i = 0; i < CONFIG.band.sparkleCount; i++) {
        const p = new THREE.Vector3(this.s.x + rand(-0.45, 0.45) * this.s.w, this.s.center + rand(-0.4, 0.4) * (this.s.yMax - this.s.yMin), this.s.z + 0.02);
        this.sparks.emit({ pos: p, vel: [0, rand(0.01, 0.05), 0], life: rand(0.8, 1.6), size: rand(0.02, 0.04), color: i % 2 ? '#fff6c8' : '#ffd77a', drag: 1 });
      }
    }
  }
  update(dt) {
    const B = CONFIG.band;
    this.op.update(dt); this.bright.update(dt);
    this.mesh.material.opacity = this.op.v * lerp(B.opacity, B.brightOpacity, this.bright.v);
    this.mesh.visible = this.op.v > 0.002;
  }
}

// ───────────── Zzz ─────────────
class Zzz {
  /** group = true：美术给的是一整组“Zzz”，整组往上飘、淡入淡出；否则用代码画的单个 Z，三个错开飘 */
  constructor(parent, tex, { group = false, aspect = 1 } = {}) {
    const Z = CONFIG.zzz;
    this.group = group; this.aspect = aspect;
    this.items = Array.from({ length: group ? Z.groupCount : Z.count }, () => { const q = quad(tex); parent.add(q); return q; });
    this.on = new Tween(0);
    this.anchor = () => new THREE.Vector3();
  }
  set(on) { this.on.go(on ? 1 : 0, on ? 0.8 : 0.4); }
  update(dt, t) {
    const Z = CONFIG.zzz;
    const a = this.on.update(dt);
    const base = a > 0.002 ? this.anchor() : null;
    if (this.group) {
      this.items.forEach((m, i) => {
        if (!base) { m.visible = false; return; }
        const ph = ((t / Z.groupSec) + i / this.items.length) % 1;
        const w = Z.groupW * (0.8 + 0.3 * ph);
        m.scale.set(w, w * this.aspect, 1);
        m.position.set(base.x + w * 0.35 + Z.sway * Math.sin(ph * TAU), base.y + w * this.aspect * 0.4 + Z.groupRise * ph, base.z + 0.03);
        m.rotation.z = 0;
        m.material.opacity = a * Math.sin(Math.PI * ph);
        m.visible = m.material.opacity > 0.01;
        m.renderOrder = depthOrder(m.position.z, 0.8);
      });
      return;
    }
    this.items.forEach((m, i) => {
      if (!base) { m.visible = false; return; }
      const ph = ((t / Z.sec) + i / Z.count) % 1;
      m.position.set(base.x + Z.sway * Math.sin(ph * TAU * 1.3 + i) + ph * 0.06, base.y + Z.rise * ph, base.z + 0.03);
      m.scale.setScalar(Z.size * (0.55 + 0.6 * ph));
      m.rotation.z = -0.25 + 0.15 * Math.sin(ph * TAU);
      m.material.opacity = a * Math.sin(Math.PI * ph);
      m.visible = m.material.opacity > 0.01;
      m.renderOrder = depthOrder(m.position.z, 0.8);
    });
  }
}

// ───────────── 保护膜（P1，只是视觉） ─────────────
function makeMembrane(parent) {
  const M = CONFIG.membrane;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: M.opacity } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform float uOpacity; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        float edge = smoothstep(1.0, 0.3, r);
        float rip = 0.5 + 0.25 * sin(r * 16.0 - uTime * 1.1) + 0.25 * sin(p.x * 7.0 + uTime * 0.6) * sin(p.y * 6.0 - uTime * 0.45);
        vec3 col = mix(vec3(1.0, 0.86, 0.96), vec3(0.78, 0.95, 1.0), 0.5 + 0.5 * sin(p.x * 3.0 + p.y * 2.0 + uTime * 0.3));
        gl_FragColor = vec4(col, uOpacity * edge * (0.45 + 0.55 * rip));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(M.radius, 64), mat);
  mesh.name = 'membrane';
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(M.center[0], M.y, M.center[1]);
  mesh.renderOrder = depthOrder(M.center[1] - M.radius, 0.1);
  parent.add(mesh);
  return mesh;
}

// ───────────── 总入口 ─────────────
export class Effects {
  static async create(world, scene, layout, settings, mochi, audio) {
    const P = CONFIG.paths;
    const starVariants = (await Promise.all((CONFIG.orb.star.files || []).map((f) => tryLoadTexture([`${P.fx}${f}.png`]))))
      .filter(Boolean).map((r) => r.tex);
    const [core, glow, star, zzz, f1, f2, f3, band] = await Promise.all([
      loadOrProcedural(`${P.orb}orb_core.png`, gen.orbCore),
      loadOrProcedural(`${P.orb}orb_glow.png`, gen.orbGlow),
      starVariants.length ? { tex: starVariants[0] } : loadOrProcedural(`${P.fx}fx_star.png`, gen.star),
      loadOrProcedural(`${P.fx}fx_zzz.png`, gen.zzz),
      loadOrProcedural(`${P.fx}fx_flame_01.png`, gen.flame(0)),
      loadOrProcedural(`${P.fx}fx_flame_02.png`, gen.flame(1)),
      loadOrProcedural(`${P.fx}fx_flame_03.png`, gen.flame(2)),
      loadOrProcedural(`${P.fx}fx_comfort_band.png`, gen.band),
    ]);
    if (starVariants.length) console.log(`[fx] 星星 ${starVariants.length} 种颜色，每次送星按顺序换`);
    return new Effects(world, scene, layout, settings, mochi, audio, { core, glow, stars: starVariants.length ? starVariants : [star.tex], zzz, flames: [f1, f2, f3], band });
  }

  constructor(world, scene, layout, settings, mochi, audio, tx) {
    this.world = world; this.scene = scene; this.layout = layout; this.mochi = mochi; this.audio = audio;
    this.dotTex = gen.dot();
    this.sched = new Scheduler();
    this.sparks = new Particles(world, this.dotTex, 320);   // Mochi 附近（星星、火苗、舒适带）
    this.trail = new Particles(world, this.dotTex, 96);     // 光团拖尾
    this.fogSparks = new Map();                             // 每团雾一组粒子，排序跟着雾的远近
    // 美术的光团图：裁掉透明边，按内容宽高比显示
    const artOpts = (t) => {
      if (t.procedural) return { art: false, aspect: 1 };
      const tr = trimTexture(t);
      const size = tr || t;
      return { art: true, aspect: size.h / size.w || 1 };
    };
    const co = artOpts(tx.core), go = artOpts(tx.glow);
    this.orb = new Orb(world, tx.core.tex, tx.glow.tex, this.trail, { coreArt: co.art, coreAspect: co.aspect, glowArt: go.art, glowAspect: go.aspect });
    this.stars = new Stars(world, tx.stars, this.sparks, audio);
    const flameProcedural = tx.flames.some((f) => f.procedural);
    const flameTrim = flameProcedural ? null : trimTexturesUnion(tx.flames);
    const flameSize = flameTrim || tx.flames[0];
    this.flames = new Flames(world, tx.flames.map((f) => f.tex), flameProcedural, this.sparks, flameSize.h / flameSize.w || 1);
    this.band = new Band(world, tx.band.tex, tx.band.procedural, this.sparks);
    let zzzOpts = {};
    if (!tx.zzz.procedural) {
      const tr = trimTexture(tx.zzz);
      const size = tr || tx.zzz;
      zzzOpts = { group: true, aspect: size.h / size.w || 1 };
    }
    this.zzz = new Zzz(world, tx.zzz.tex, zzzOpts);
    this.zzz.anchor = () => mochi.zzzWorld(new THREE.Vector3());
    this.membrane = CONFIG.membrane.enabled ? makeMembrane(world) : null;

    this.bgGray = new THREE.Color(CONFIG.world.bgGray);
    this.bgClear = new THREE.Color(CONFIG.world.bgClear);
    this.skyT = new Tween(0);
    scene.background = this.bgGray.clone();
    this.applyLayout(settings);
  }

  applyLayout(s) {
    this.settings = s;
    this.zones = s.zones;
    this.orb.setRest(s.orbRest);
    this.band.apply(s);
  }

  // ── 雾 / 区域 ──
  zoneTarget(i) {
    const z = this.zones[i];
    const fog = z && this.layout.get(z.fog);
    return fog && fog.enabled && !fog.melted ? fog.base.clone() : null;
  }
  /** 下一团还没融化的雾（HUFF 开始时 Mochi 朝它转身） */
  nextFogTarget(fromIndex) {
    for (let i = fromIndex; i < this.zones.length; i++) { const t = this.zoneTarget(i); if (t) return t; }
    return null;
  }
  _fogParticles(fog) {
    let ps = this.fogSparks.get(fog.key);
    if (!ps) { ps = new Particles(this.world, this.dotTex, 64); this.fogSparks.set(fog.key, ps); }
    ps.mesh.renderOrder = depthOrder(fog.base.z, 0.3);
    return ps;
  }
  /** 融化第 i 团雾 → 0.4 秒后对应区域灰→彩 1.5 秒。返回是否真的融化了一团雾。 */
  meltZone(i) {
    const z = this.zones[i];
    if (!z) return false;
    const M = CONFIG.melt;
    const fog = this.layout.get(z.fog);
    let melted = false;
    if (fog && !fog.melted) {
      fog.melted = true; melted = true;
      fog.melt.go(1, M.dur, ease.outSine);
      const n = Math.round(rand(M.particlesMin, M.particlesMax));
      const ps = this._fogParticles(fog);
      const spread = Math.min(0.5, fog.w * 0.25);
      ps.burst(fog.base, n, { speed: 0.25 + fog.w * 0.08, up: 0.25, life: [1.0, 1.8], size: [0.025 * (1 + fog.w * 0.3), 0.05 * (1 + fog.w * 0.3)], colors: M.colors, spread, grav: 0.06 });
      this.audio?.play('sfx_melt_chime');
    }
    this.sched.after(M.recolorDelay, () => this.recolor(z.layers || [], M.recolorDur));
    return melted;
  }
  recolor(keys, dur) {
    for (const k of keys) { const L = this.layout.get(k); if (L) L.gray.go(0, dur, ease.inOutSine); }
  }
  /** END：天空灰→彩 3 秒，整体亮度略升；所有雾残余淡出 */
  clearSky() {
    const W = CONFIG.world;
    const sky = this.layout.get(CONFIG.layerRules.skyKey);
    if (sky) sky.gray.go(0, W.skyClearSec, ease.inOutSine);
    this.skyT.go(1, W.skyClearSec, ease.inOutSine);
    this.zones.forEach((z, i) => {
      const fog = this.layout.get(z.fog);
      if (fog && !fog.melted) { fog.melted = true; fog.melt.go(1, W.skyClearSec * 0.8, ease.inOutSine); this.recolor(z.layers || [], W.skyClearSec); }
    });
    // 其余还是灰的层（例如远景云、近处云）随天空一起恢复
    for (const L of this.layout.layers.values()) if (L.gray.to > 0 || L.gray.v > 0.001) L.gray.go(0, W.skyClearSec, ease.inOutSine);
  }
  resetAll() {
    this.sched.clear();
    for (const L of this.layout.layers.values()) {
      L.melt.set(0); L.melted = false;
      L.gray.set(L.startGray);
    }
    this.skyT.set(0); sharedBright.value = 1;
    this.scene.background.copy(this.bgGray);
    this.band.op.set(0); this.band.bright.set(0);
    this.zzz.on.set(0);
    this.stars.clear(); this.flames.clear(); this.sparks.clear(); this.trail.clear();
    for (const ps of this.fogSparks.values()) ps.clear();
  }

  update(dt, t) {
    this.sched.update(dt);
    this.orb.update(dt, t);
    this.stars.update(dt);
    this.flames.update(dt);
    this.band.update(dt);
    this.zzz.update(dt, t);
    this.sparks.mesh.renderOrder = depthOrder(this.mochi.depthZ, 0.8);
    this.sparks.update(dt); this.trail.update(dt);
    for (const ps of this.fogSparks.values()) ps.update(dt);
    const k = this.skyT.update(dt);
    this.scene.background.copy(this.bgGray).lerp(this.bgClear, k);
    sharedBright.value = lerp(1, CONFIG.world.endBrightness, k);
    if (this.membrane) this.membrane.material.uniforms.uTime.value = t;
  }
}
