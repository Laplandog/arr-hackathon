// Mochi 剪纸动画：所有部件是同一张 1024×1024 画布导出、原位对齐的平面，叠在一起，绕支点旋转/缩放。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadOrPlaceholder } from './assets.js';
import { makeLayerMaterial, PLANE } from './layout.js';
import { Tween, Seq, ease, DEG, lerp, rand, clamp, depthOrder } from './util.js';

const C = CONFIG.mochi;
const TAU = Math.PI * 2;

/** pivots.json → { name: [px, py] }（像素，左上角原点，y 向下）。兼容 [x,y] / {x,y} / "mochi_" 前缀 / {pivots:{...}} */
function normPivots(raw) {
  const out = {};
  const src = raw && typeof raw.pivots === 'object' ? raw.pivots : raw || {};
  const canvas = +(raw?.canvas ?? raw?.canvasSize ?? C.canvasPx) || C.canvasPx;
  const k = C.canvasPx / canvas;
  for (const [k0, v] of Object.entries(src)) {
    if (k0.startsWith('_')) continue;
    const key = k0.replace(/^mochi_/, '').replace(/\.png$/, '');
    let p = null;
    if (Array.isArray(v) && v.length >= 2) p = [+v[0], +v[1]];
    else if (v && typeof v === 'object') {
      const x = v.x ?? v.px ?? v.pivotX, y = v.y ?? v.py ?? v.pivotY;
      if (x != null && y != null) p = [+x, +y];
    }
    if (p && isFinite(p[0]) && isFinite(p[1])) out[key] = [p[0] * k, p[1] * k];
  }
  return out;
}

/** 像素 → 画布归一化坐标（画布边长 = 1，中心为原点，y 取反） */
const norm = ([px, py]) => [(px - C.canvasPx / 2) / C.canvasPx, -(py - C.canvasPx / 2) / C.canvasPx];

export class Mochi {
  static async create(parent, worldGroup, pivotsRaw, settings) {
    const all = [...C.standParts, ...C.sleepParts];
    const texes = await Promise.all(all.map((p) => loadOrPlaceholder(
      [`${CONFIG.paths.mochi}${p.file}.png`],
      { rect: C.placeholderRects[p.name] || [512, 512, 600, 600], canvasPx: C.canvasPx },
    )));
    const texMap = {};
    all.forEach((p, i) => { texMap[p.name] = texes[i]; });
    return new Mochi(parent, worldGroup, texMap, pivotsRaw, settings);
  }

  constructor(parent, worldGroup, texMap, pivotsRaw, settings) {
    this.world = worldGroup;
    this.root = new THREE.Group(); this.root.name = 'mochi';
    this.flipG = new THREE.Group();          // scale = S（× 朝向 / 转圈）
    this.stand = new THREE.Group(); this.sleep = new THREE.Group();
    this.flipG.add(this.stand, this.sleep);
    this.root.add(this.flipG);
    parent.add(this.root);

    this.pivots = normPivots(pivotsRaw);
    this.anchorsPx = { ...C.defaultAnchors };
    for (const a of Object.keys(C.defaultAnchors)) if (this.pivots[a]) this.anchorsPx[a] = this.pivots[a];

    this.parts = {};
    this._build(C.standParts, this.stand, 'stand', texMap);
    this._build(C.sleepParts, this.sleep, 'sleep', texMap);
    // 锚点：火苗出口、星星落点（跟着头动）、Zzz 起点（睡姿）
    this.anchors = {};
    const headPv = this.parts.head?.pivot || this.stand;
    for (const [name, parentObj] of [['mouth', headPv], ['head_top', headPv], ['zzz', this.sleep]]) {
      const o = new THREE.Object3D(); o.name = `anchor_${name}`;
      parentObj.add(o); this.anchors[name] = o;
    }

    // 状态
    this.x = new Tween(0); this.y = new Tween(0); this.z = new Tween(0);
    this.belly = new Tween(1); this.head = new Tween(0); this.hopY = new Tween(0);
    this.yaw = new Tween(0); this.face = new Tween(1); this.standW = new Tween(0);
    this.blushT = new Tween(0); this.hoverAmt = new Tween(0); this.spinT = new Tween(0);
    this.wingMode = 'fold'; this.prevWing = 'fold'; this.wingBlend = new Tween(1);
    this.eyes = 'open'; this.mouth = 'closed'; this.waitMode = false; this.flying = false;
    this.blinkIn = rand(C.blink.minSec, C.blink.maxSec); this.blinkLeft = 0;
    this.action = null;  // 头部动作（哈火、喷嚏…）
    this.move = null;    // 复合移动（飞回窝）
    this.queue = [];
    this.applyLayout(settings);
    this.reset();
  }

  _build(list, group, pose, texMap) {
    let idx = -1, lastGroup = null;
    for (const p of list) {
      if (!(p.group && p.group === lastGroup)) idx++;
      lastGroup = p.group || null;
      const mat = makeLayerMaterial(texMap[p.name].tex, null, { side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(PLANE, mat);
      mesh.name = p.file;
      const pivot = new THREE.Object3D();
      pivot.name = `pivot_${p.name}`;
      pivot.add(mesh);
      (p.parent ? this.parts[p.parent].pivot : group).add(pivot);
      this.parts[p.name] = { def: p, pose, pivot, mesh, mat, idx, group: p.group || null };
    }
  }

  _pivotPx(part) {
    const n = part.def.name;
    return this.pivots[n] || (part.group && this.pivots[part.group]) || [C.canvasPx / 2, C.canvasPx / 2];
  }

  /** 按当前高度 S 摆放部件和支点：支点本地偏移 = ((px−512)/1024 × S, −(py−512)/1024 × S)，部件反向偏移 */
  _placeRig() {
    const gap = C.layerGap / this.S; // 归一化后的 1 mm
    for (const part of Object.values(this.parts)) {
      const [dx, dy] = norm(this._pivotPx(part));
      const parent = part.def.parent ? this.parts[part.def.parent] : null;
      const [pdx, pdy] = parent ? norm(this._pivotPx(parent)) : [0, 0];
      const pz = parent ? parent.idx * gap : 0;
      part.pivot.position.set(dx - pdx, dy - pdy, part.idx * gap - pz);
      part.mesh.position.set(-dx, -dy, 0);
    }
    const head = this.parts.head;
    const [hdx, hdy] = head ? norm(this._pivotPx(head)) : [0, 0];
    const hz = head ? head.idx * gap : 0;
    for (const [name, o] of Object.entries(this.anchors)) {
      const [ax, ay] = norm(this.anchorsPx[name]);
      if (name === 'zzz') o.position.set(ax, ay, 0.02);
      else o.position.set(ax - hdx, ay - hdy, 12 * gap - hz);
    }
  }

  applyLayout(s) {
    this.settings = s;
    this.S = s.height;
    this.home = s.homePos.clone();
    this.groundY = s.groundY;
    this.flightPos = s.flightPos.clone();
    this._placeRig();
    if (this._inited && !this.move && !this.y.active) { // 热更新：直接挪到新位置
      this.x.set(this.home.x); this.z.set(this.home.z);
    }
    this._inited = true;
  }

  // ───────────── 基本控制 ─────────────
  reset() {
    this.action?.cancel(); this.action = null; this.move?.cancel(); this.move = null; this.queue = [];
    this.x.set(this.home.x); this.y.set(this.home.y); this.z.set(this.home.z);
    this.belly.set(1); this.head.set(0); this.hopY.set(0); this.yaw.set(0); this.face.set(1);
    this.standW.set(0); this.blushT.set(0); this.hoverAmt.set(0); this.spinT.set(0);
    this.setWings('fold', 0); this.eyes = 'open'; this.mouth = 'closed'; this.waitMode = false; this.flying = false;
  }
  setPose(p, dur = C.poseFadeSec) { this.standW.go(p === 'stand' ? 1 : 0, dur, ease.linear); }
  get pose() { return this.standW.to > 0.5 ? 'stand' : 'sleep'; }
  setWings(mode, blendSec = 0.25) {
    if (mode === this.wingMode) return;
    this.prevWing = this.wingMode; this.wingMode = mode;
    this.wingBlend.set(0).go(1, blendSec, ease.inOutSine);
    if (!(blendSec > 0)) this.wingBlend.set(1);
    this.flying = mode !== 'fold';
  }
  setEyes(e) { this.eyes = e; }
  setMouth(m) { this.mouth = m; }
  setHover(on) { this.hoverAmt.go(on ? 1 : 0, 0.3); }
  setWaitMode(on) { this.waitMode = on; }
  setBelly(v, dur) { this.belly.go(v, dur, ease.inOutSine); }

  /** 只改 y（飞行吸气/呼气用） */
  flyY(y, dur, e = ease.inOutSine) { this.move?.cancel(); this.move = null; this.y.go(y, dur, e); }

  /** 飞回小窝：x/z 回 home，y 走一个小弧线 */
  flyHome(dur = C.settleSec, onDone) {
    this.move?.cancel();
    const x0 = this.x.v, y0 = this.y.v, z0 = this.z.v;
    this.move = new Seq([{
      dur, update: (p) => {
        const e = ease.inOutSine(p);
        this.x.set(lerp(x0, this.home.x, e)); this.z.set(lerp(z0, this.home.z, e));
        this.y.set(lerp(y0, this.home.y, e) + Math.sin(Math.PI * p) * C.settleArc);
      },
    }], () => { this.move = null; onDone?.(); });
  }
  /** 回到飞行起点（窝和起飞点不同时用） */
  toFlightStart(dur = 0.5) {
    this.move?.cancel(); this.move = null;
    this.x.go(this.flightPos.x, dur); this.z.go(this.flightPos.z, dur); this.y.go(this.groundY, dur);
  }

  /** 头部动作队列：正在哈火时再来一个动作就排队 */
  _act(steps, onDone) {
    const run = () => { this.action = new Seq(steps, () => { this.action = null; onDone?.(); const n = this.queue.shift(); n?.(); }); };
    if (this.action) this.queue.push(run); else run();
  }

  /** 哈火：头部后仰 −8° 再前推 +6°；张嘴；onRelease 时喷火 */
  huff(onRelease) {
    const H = C.huff, sg = H.headSign;
    this._act([
      { dur: H.backSec, start: () => { this.setMouth('closed'); this.setEyes('open'); }, update: (p) => this.head.set(lerp(0, H.backDeg * sg, ease.outQuad(p))) },
      { dur: H.pushSec, start: () => { this.setMouth('open'); onRelease?.(); }, update: (p) => this.head.set(lerp(H.backDeg * sg, H.forwardDeg * sg, ease.outCubic(p))) },
      { dur: H.holdSec },
      { dur: H.recoverSec, start: () => this.setMouth('closed'), update: (p) => this.head.set(lerp(H.forwardDeg * sg, 0, ease.inOutSine(p))) },
    ]);
  }

  /** P1 喷嚏 */
  sneeze(onBurst) {
    const S = C.sneeze, sg = C.huff.headSign;
    this._act([
      { dur: S.windupSec, start: () => this.setEyes('closed'), update: (p) => this.head.set(lerp(0, S.windupDeg * sg, ease.outQuad(p))) },
      { dur: S.jerkSec, start: () => { this.setMouth('open'); onBurst?.(); }, update: (p) => this.head.set(lerp(S.windupDeg * sg, S.jerkDeg * sg, ease.outCubic(p))) },
      { dur: S.recoverSec, update: (p) => this.head.set(lerp(S.jerkDeg * sg, 0, ease.inOutSine(p))), end: () => { this.setMouth('closed'); this.setEyes('open'); } },
    ]);
  }

  hop(h = C.hop.height, sec = C.hop.sec) {
    this.hopY.go(h, sec * 0.45, ease.outQuad, () => this.hopY.go(0, sec * 0.55, ease.inQuad));
  }

  /** 开心：笑眼 + 原地小跳（P1：腮红淡入、纸片转圈） */
  happy({ spin = false } = {}) {
    this.setEyes('happy'); this.setMouth('smile');
    this.blushT.go(1, C.blushFadeSec);
    this.hop();
    if (spin) this.spinT.set(0).go(1, C.spinSec, ease.inOutSine, () => this.spinT.set(0));
  }
  calm() { this.setEyes('open'); this.setMouth('closed'); this.blushT.go(0, 0.6); }

  wake() {
    this.setPose('stand'); this.calm(); this.setWings('fold'); this.hop(0.035, 0.4);
  }

  /** 暂停：落到地面，切睡姿趴下 */
  rest() {
    const go = () => {
      this.move?.cancel(); this.move = null;
      this.setHover(false); this.setWings('fold'); this.calm(); this.waitMode = false;
      this.y.go(this.groundY, C.restDescendSec, ease.inOutSine);
      this.setPose('sleep', C.poseFadeSec);
    };
    if (this.action) this.queue = [go]; else go();
  }

  /** HUFF 时朝向雾（'turn'：小角度转身；'flip'：纸片翻面；null = 回正） */
  faceToward(target) {
    const F = C.faceFog;
    if (!target || F.mode === 'none') { this.yaw.go(0, F.sec); this.face.go(1, F.sec); return; }
    const dx = target.x - this.x.v;
    if (F.mode === 'flip') {
      if (Math.abs(dx) > 0.2) this.face.go(Math.sign(dx) * C.artFacing, F.sec);
    } else {
      this.yaw.go(-F.maxDeg * clamp(dx / 1.5, -1, 1), F.sec);
    }
  }

  // ───────────── 锚点（world 组本地坐标） ─────────────
  _anchor(name, out) {
    this.root.updateWorldMatrix(true, true);
    this.anchors[name].getWorldPosition(out);
    return this.world.worldToLocal(out);
  }
  mouthWorld(out = new THREE.Vector3()) { return this._anchor('mouth', out); }
  headTopWorld(out = new THREE.Vector3()) { return this._anchor('head_top', out); }
  zzzWorld(out = new THREE.Vector3()) { return this._anchor('zzz', out); }
  centerWorld(out = new THREE.Vector3()) { return out.set(this.x.v, this.y.v, this.z.v); }
  /** 正在哪团雾的方向：给 flame 用 */
  get depthZ() { return this.root.position.z; }

  // ───────────── 每帧 ─────────────
  _wingAngle(mode, t) {
    const W = C.wing;
    switch (mode) {
      case 'flap': return W.flapDeg * Math.sin(t * TAU * W.flapHz);
      case 'hover': return W.hoverDeg * 0.5 + W.hoverDeg * 0.5 * Math.sin(t * TAU * W.hoverHz);
      case 'glide': return W.glideOpenDeg + W.glideDeg * Math.sin(t * TAU * W.glideHz);
      default: return W.foldDeg + W.foldWiggleDeg * Math.sin(t * TAU * W.foldHz);
    }
  }

  update(dt, t) {
    this.action?.update(dt);
    this.move?.update(dt);
    for (const tw of [this.x, this.y, this.z, this.belly, this.head, this.hopY, this.yaw, this.face, this.standW,
      this.blushT, this.hoverAmt, this.spinT, this.wingBlend]) tw.update(dt);

    // 位置
    const hov = Math.sin(t * TAU / C.hover.period) * C.hover.amp * this.hoverAmt.v;
    this.root.position.set(this.x.v, this.y.v + hov + this.hopY.v, this.z.v);
    this.root.rotation.y = this.yaw.v * DEG;
    const spin = this.spinT.v > 0 ? Math.cos(this.spinT.v * TAU) : 1; // 纸片翻面
    this.flipG.scale.set(this.S * this.face.v * spin, this.S, this.S);

    // 眨眼（只在睁眼时）
    if (this.eyes === 'open' && this.standW.v > 0.5) {
      if (this.blinkLeft > 0) this.blinkLeft -= dt;
      else if ((this.blinkIn -= dt) <= 0) { this.blinkLeft = C.blink.closedSec; this.blinkIn = rand(C.blink.minSec, C.blink.maxSec); }
    } else this.blinkLeft = 0;
    const eyeShown = this.blinkLeft > 0 ? 'closed' : this.eyes;

    // 姿势交叉淡入淡出 + 变体显示
    const wS = this.standW.v, wL = 1 - wS;
    const base = depthOrder(this.root.position.z);
    for (const part of Object.values(this.parts)) {
      let a = part.pose === 'stand' ? wS : wL;
      if (part.group === 'eye') a *= part.def.name === `eye_${eyeShown}` ? 1 : 0;
      else if (part.group === 'mouth') a *= part.def.name === `mouth_${this.mouth}` ? 1 : 0;
      else if (part.def.name === 'blush') a *= this.blushT.v;
      part.mat.opacity = a;
      part.mesh.visible = a > 0.002;
      part.mesh.renderOrder = base + part.idx * 0.05 + (part.pose === 'sleep' ? 0.6 : 0);
    }

    // 睡姿肚皮：以 sleep_belly 支点 y 缩放 1.0↔1.06，周期 4 秒
    const sb = this.parts.sleep_belly;
    if (sb) sb.pivot.scale.y = 1 + C.sleepBreath.amp * (0.5 - 0.5 * Math.cos(t * TAU / C.sleepBreath.period));
    // 站姿肚皮
    const b = this.parts.belly;
    if (b) b.pivot.scale.y = this.belly.v * (this.waitMode ? 1 + C.idleBreath.amp * (0.5 - 0.5 * Math.cos(t * TAU / C.idleBreath.period)) : 1);

    // 翅膀：绕翅根支点转
    const wa = lerp(this._wingAngle(this.prevWing, t), this._wingAngle(this.wingMode, t), this.wingBlend.v);
    for (const w of ['wing_left', 'wing_right']) {
      const p = this.parts[w];
      if (p) p.pivot.rotation.z = wa * DEG * (C.wing.upSign[w] ?? 1);
    }
    // 尾巴
    const T = C.tail;
    const tail = this.parts.tail;
    if (tail) tail.pivot.rotation.z = (this.flying ? T.flyDeg * Math.sin(t * TAU * T.flyHz) : T.idleDeg * Math.sin(t * TAU * T.idleHz)) * DEG;
    // 头
    const head = this.parts.head;
    if (head) head.pivot.rotation.z = this.head.v * DEG;
  }
}
