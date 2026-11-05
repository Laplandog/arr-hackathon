// Mochi 剪纸动画：所有部件是同一张 1024×1024 画布导出、原位对齐的平面，叠在一起，绕支点旋转/缩放。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadOrPlaceholder, tryLoadTexture } from './assets.js';
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
  static async create(parent, worldGroup, pivotsRaw, settings, posesMeta = null) {
    // 整图姿势模式：有 mochi_poses.json 且 idle + sleep 两张图都在
    if (posesMeta && Array.isArray(posesMeta.canvas) && Array.isArray(posesMeta.charBox)) {
      const files = C.sprite.files;
      const names = Object.keys(files);
      const got = await Promise.all(names.map((n) => tryLoadTexture([`${CONFIG.paths.mochi}${files[n]}.png`])));
      const tex = {};
      names.forEach((n, i) => { if (got[i]) tex[n] = got[i]; });
      if (tex.idle && tex.sleep) {
        console.log(`[mochi] 整图姿势模式：${Object.keys(tex).join(', ')}`);
        return new Mochi(parent, worldGroup, null, pivotsRaw, settings, { meta: posesMeta, tex });
      }
      console.warn('[mochi] 有 mochi_poses.json 但缺 idle / sleep 姿势图，改用拆件模式');
    }
    const all = [...C.standParts, ...C.sleepParts];
    const texes = await Promise.all(all.map((p) => loadOrPlaceholder(
      [`${CONFIG.paths.mochi}${p.file}.png`],
      { rect: C.placeholderRects[p.name] || [512, 512, 600, 600], canvasPx: C.canvasPx },
    )));
    const texMap = {};
    all.forEach((p, i) => { texMap[p.name] = texes[i]; });
    return new Mochi(parent, worldGroup, texMap, pivotsRaw, settings);
  }

  constructor(parent, worldGroup, texMap, pivotsRaw, settings, sprite = null) {
    this.world = worldGroup;
    this.mode = sprite ? 'sprite' : 'parts';
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
    this.anchors = {};
    if (sprite) {
      this._buildSprite(sprite);
    } else {
      this._build(C.standParts, this.stand, 'stand', texMap);
      this._build(C.sleepParts, this.sleep, 'sleep', texMap);
      // 锚点：火苗出口、星星落点（跟着头动）、Zzz 起点（睡姿）
      const headPv = this.parts.head?.pivot || this.stand;
      for (const [name, parentObj] of [['mouth', headPv], ['head_top', headPv], ['zzz', this.sleep]]) {
        const o = new THREE.Object3D(); o.name = `anchor_${name}`;
        parentObj.add(o); this.anchors[name] = o;
      }
    }
    this.resting = false; this.sneezing = false;

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

  /**
   * 整图姿势：每个姿势一张平面，全部同一画布、脚底对齐（tools/prep_poses.py 已处理）。
   * 归一化单位：站立角色高度 = 1（再由 flipG 缩放成 mochi.height 米）。root 原点 = 角色中心，脚底在 y = −0.5。
   */
  _buildSprite({ meta, tex }) {
    const [cw, ch] = meta.canvas;
    const [bx0, by0, bx1, by1] = meta.charBox;
    const charH = by1 - by0;
    const feetX = (bx0 + bx1) / 2, feetY = by1;
    this.spriteFeet = new THREE.Group(); // 支点在脚底：呼吸拉伸、倾斜都绕脚底
    this.spriteFeet.name = 'mochi_feet';
    this.spriteFeet.position.set(0, -0.5, 0);
    this.flipG.add(this.spriteFeet);
    const px = (x, y) => [(x - feetX) / charH, -(y - feetY) / charH];
    const [cx, cy] = px(cw / 2, ch / 2);
    this.sprites = {};
    for (const [name, t] of Object.entries(tex)) {
      const mat = makeLayerMaterial(t.tex, null, { side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(PLANE, mat);
      mesh.name = C.sprite.files[name];
      mesh.scale.set(cw / charH, ch / charH, 1);
      mesh.position.set(cx, cy, 0);
      mesh.visible = false;
      this.spriteFeet.add(mesh);
      this.sprites[name] = { mesh, mat };
    }
    this.spriteCur = 'sleep'; this.spritePrev = null; this.spriteBlend = 1; this.spriteFade = C.sprite.fadeSec;
    const A = { ...C.defaultAnchors, ...(meta.anchors || {}) };
    for (const name of ['mouth', 'head_top', 'zzz']) {
      const o = new THREE.Object3D(); o.name = `anchor_${name}`;
      const [ax, ay] = px(...A[name]);
      o.position.set(ax, ay, 0.02);
      this.spriteFeet.add(o); this.anchors[name] = o;
    }
    this.artFacing = meta.artFacing === -1 ? -1 : 1;
  }

  _spriteTarget() {
    const has = (n) => !!this.sprites[n];
    if (this.standW.to < 0.5) return this.resting && has('rest') ? 'rest' : 'sleep';
    if (this.sneezing && has('sneeze')) return 'sneeze';
    if (this.mouth === 'open' && has('huff')) return 'huff';
    if ((this.eyes === 'happy' || this.mouth === 'smile') && has('happy')) return 'happy';
    return 'idle';
  }

  _spriteMotion(mode, t) {
    const S = C.sprite;
    switch (mode) {
      case 'flap': { const s = Math.sin(t * TAU * C.wing.flapHz); return { deg: S.flap.deg * s, bob: S.flap.bob * Math.abs(s), sx: 1 + S.flap.squash * s }; }
      case 'hover': return { deg: S.hover.deg * Math.sin(t * TAU * C.wing.hoverHz), bob: 0, sx: 1 };
      case 'glide': return { deg: S.glide.deg + S.glide.swayDeg * Math.sin(t * TAU * C.wing.glideHz), bob: 0, sx: 1 };
      default: return { deg: S.fold.deg * Math.sin(t * TAU * C.wing.foldHz), bob: 0, sx: 1 };
    }
  }

  _updateSprite(dt, t) {
    const S = C.sprite;
    // 选姿势 + 交叉淡入：新姿势叠在上面淡入，旧姿势后半段才淡出（避免两张半透明叠出“透视”）
    const target = this._spriteTarget();
    if (target !== this.spriteCur) {
      const quick = ['huff', 'sneeze'].includes(target) || ['huff', 'sneeze'].includes(this.spriteCur);
      const lie = (n) => n === 'sleep' || n === 'rest';
      this.spriteFade = quick ? S.quickFadeSec : lie(target) !== lie(this.spriteCur) ? S.fadeSec : S.exprFadeSec;
      this.spritePrev = this.spriteCur; this.spriteCur = target; this.spriteBlend = 0;
    }
    this.spriteBlend = Math.min(1, this.spriteBlend + dt / this.spriteFade);
    const base = depthOrder(this.root.position.z);
    for (const [name, s] of Object.entries(this.sprites)) {
      let a = 0;
      if (name === this.spriteCur) a = this.spriteBlend;
      else if (name === this.spritePrev) a = 1 - Math.max(0, (this.spriteBlend - 0.5) * 2);
      s.mat.opacity = a;
      s.mesh.visible = a > 0.002;
      s.mesh.renderOrder = base + (name === this.spriteCur ? 0.2 : 0.1);
    }
    // 动作：没有单独的翅膀/肚皮，用整张图的拉伸、倾斜、上下弹表现
    const lying = this.spriteCur === 'sleep' || this.spriteCur === 'rest';
    let sy = 1, sx = 1, deg = 0, bob = 0;
    if (lying) {
      sy = 1 + S.sleepBreathAmp * (0.5 - 0.5 * Math.cos(t * TAU / C.sleepBreath.period));
    } else {
      sy = 1 + (this.belly.v - 1) * S.bellyStretchY;
      sx = 1 + (this.belly.v - 1) * S.bellyStretchX;
      if (this.waitMode) sy *= 1 + C.idleBreath.amp * 0.5 * (0.5 - 0.5 * Math.cos(t * TAU / C.idleBreath.period));
      const a = this._spriteMotion(this.prevWing, t), b = this._spriteMotion(this.wingMode, t), k = this.wingBlend.v;
      deg = lerp(a.deg, b.deg, k); bob = lerp(a.bob, b.bob, k); sx *= lerp(a.sx, b.sx, k);
      deg += this.head.v * S.headToLean;
    }
    this.spriteFeet.scale.set(sx, sy, 1);
    this.spriteFeet.rotation.z = deg * DEG;
    this.spriteFeet.position.y = -0.5 + bob;
  }

  _pivotPx(part) {
    const n = part.def.name;
    return this.pivots[n] || (part.group && this.pivots[part.group]) || [C.canvasPx / 2, C.canvasPx / 2];
  }

  /** 按当前高度 S 摆放部件和支点：支点本地偏移 = ((px−512)/1024 × S, −(py−512)/1024 × S)，部件反向偏移 */
  _placeRig() {
    if (this.mode === 'sprite') return; // 整图模式的平面和锚点在 _buildSprite 里摆好，只随 S 缩放
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
    this.resting = false; this.sneezing = false;
    if (this.mode === 'sprite') { this.spriteCur = 'sleep'; this.spritePrev = null; this.spriteBlend = 1; }
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
      { dur: S.jerkSec, start: () => { this.sneezing = true; this.setMouth('open'); onBurst?.(); }, update: (p) => this.head.set(lerp(S.windupDeg * sg, S.jerkDeg * sg, ease.outCubic(p))) },
      { dur: S.recoverSec, update: (p) => this.head.set(lerp(S.jerkDeg * sg, 0, ease.inOutSine(p))), end: () => { this.sneezing = false; this.setMouth('closed'); this.setEyes('open'); } },
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
  calm() { this.setEyes('open'); this.setMouth('closed'); this.blushT.go(0, 0.6); this.resting = false; }

  wake() {
    this.setPose('stand'); this.calm(); this.setWings('fold'); this.hop(0.035, 0.4);
  }

  /** 暂停：落到地面，切睡姿趴下 */
  rest() {
    const go = () => {
      this.move?.cancel(); this.move = null;
      this.setHover(false); this.setWings('fold'); this.calm(); this.waitMode = false;
      this.resting = true; this.faceToward(null);
      this.y.go(this.groundY, C.restDescendSec, ease.inOutSine);
      this.setPose('sleep', C.poseFadeSec);
    };
    if (this.action) this.queue = [go]; else go();
  }

  /** HUFF 时朝向雾（'turn'：小角度转身；'flip'：纸片翻面；null = 回正） */
  faceToward(target) {
    const F = C.faceFog;
    const mode = this.mode === 'sprite' ? C.sprite.faceFogMode : F.mode;
    const facing = this.mode === 'sprite' ? this.artFacing : C.artFacing;
    if (!target || mode === 'none') { this.yaw.go(0, F.sec); this.face.go(1, F.sec); return; }
    const dx = target.x - this.x.v;
    if (mode === 'flip') {
      if (Math.abs(dx) > 0.2) this.face.go(Math.sign(dx) * facing, F.sec);
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
    if (this.mode === 'sprite') { this._updateSprite(dt, t); return; }

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
