// 新手引导「Mochi 醒来的第一天」：孩子自己摸索玩法，不照说明书做。
//
// 规则：孩子带头，Mochi 学孩子。Mochi 从不先示范动作，只表现“它怎么了”（困、冷、够不着云…）。
// 每一段：先安静等几秒（孩子可能自己就发现了）→ 旁白第 1 句说 Mochi 怎么了 → 第 2 句给线索 → 第 3 句才说怎么帮。
// 孩子任何时候做到了（家长按 Space，或者头显自动判断），立刻有结果；后面的提示就不会再播。
// 一直没做也没关系：最后世界自己慢慢完成，照样往下走（没有失败、没有倒计时压力）。
//
//   wake   看一看：孩子看着 Mochi，它就慢慢醒来（头显朝向，自动）
//   mirror 你动我也动：Mochi 学孩子歪头、转头、抬头（头显，自动）
//   relax  一起放松：孩子安静下来，害羞的萤火虫才会靠近（头显，自动）
//   smell  吸-停-呼：鼻子前的花开了 → 孩子闻 → Mochi 被托着飞起来、停一下、落下（家长确认）
//   huff   哈气：冰窗后面的 Mochi 冷得发抖 → 孩子哈气 → 冰窗化开、热气飞进 Mochi 嘴里、火苗变大（家长确认）
//   cough  咳嗽（只在模板 includeCough 时）：种子卡在 Mochi 喉咙里，只请一次，不加码（家长确认）
//   egg    收尾：Mochi 看看冰凉的龙蛋，再看看孩子 → 进入正式练习
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PLANE } from './layout.js';
import { canvasTexture, tryLoadTexture } from './assets.js';
import { Tween, Seq, ease, lerp, rand, clamp, bezier, depthOrder, DEG } from './util.js';
import { eggGen } from './egg.js';
import { ambientGen } from './ambient.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

function quad(tex, { additive = false, color = 0xffffff } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const m = new THREE.Mesh(PLANE, mat);
  m.rotation.order = 'YXZ';
  return m;
}
/** 让近处的平面正对孩子的头（左右 + 上下） */
function faceHead(mesh, head, roll = 0) {
  const p = mesh.position, dx = head.pos.x - p.x, dy = head.pos.y - p.y, dz = head.pos.z - p.z;
  mesh.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), roll, 'YXZ');
}

// ───────────── 代码画的道具贴图 ─────────────
export const tutGen = {
  /** 结霜的小冰窗：奶油色纸框 + 冰蓝色霜面 + 冰花纹 */
  frost: () => canvasTexture(512, 400, (g, w, h) => {
    const r = 34;
    const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, ww, hh, rad) : g.rect(x, y, ww, hh); };
    g.shadowColor = 'rgba(60,40,70,.35)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
    rr(10, 8, w - 20, h - 22, r); g.fillStyle = '#f2e6cc'; g.fill();
    g.shadowColor = 'transparent';
    // 把框中间掏空（只剩纸框），再铺一层半透明的霜
    g.globalCompositeOperation = 'destination-out';
    rr(34, 32, w - 68, h - 70, r * 0.6); g.fill();
    g.globalCompositeOperation = 'source-over';
    // 中间的霜薄一点，能隐约看见窗后面 Mochi 的影子；越往边上霜越厚
    rr(34, 32, w - 68, h - 70, r * 0.6); g.fillStyle = 'rgba(222,234,250,0.62)'; g.fill();
    g.save(); rr(34, 32, w - 68, h - 70, r * 0.6); g.clip();
    const vg = g.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.55);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(255,255,255,0.75)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // 冰花：从边上长进来的枝杈 + 几朵六角雪花
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
    const branch = (x, y, a, len, wd, depth) => {
      if (depth <= 0 || len < 6) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      for (let k = 1; k <= 3; k++) {
        const t = k / 4, bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
        branch(bx, by, a + 0.9, len * 0.38, wd * 0.6, depth - 1);
        branch(bx, by, a - 0.9, len * 0.38, wd * 0.6, depth - 1);
      }
    };
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const side = i % 4, u = rnd();
      const [x, y, a] = side === 0 ? [34 + u * (w - 68), 32, Math.PI / 2] : side === 1 ? [34 + u * (w - 68), h - 38, -Math.PI / 2]
        : side === 2 ? [34, 32 + u * (h - 70), 0] : [w - 34, 32 + u * (h - 70), Math.PI];
      branch(x, y, a + (rnd() - 0.5) * 0.9, 50 + rnd() * 70, 3, 3);
    }
    for (let i = 0; i < 9; i++) {
      const cx = 70 + rnd() * (w - 140), cy = 60 + rnd() * (h - 130), R = 10 + rnd() * 14;
      for (let k = 0; k < 6; k++) branch(cx, cy, (k * Math.PI) / 3, R, 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 90; i++) { g.beginPath(); g.arc(34 + rnd() * (w - 68), 32 + rnd() * (h - 70), rnd() * 1.8 + 0.4, 0, TAU); g.fill(); }
    g.restore();
  }),
  /** 一团软软的气 */
  puff: () => canvasTexture(128, 128, (g, w) => {
    for (const [x, y, r] of [[0.5, 0.55, 0.3], [0.32, 0.5, 0.2], [0.68, 0.5, 0.22], [0.45, 0.36, 0.2], [0.6, 0.38, 0.17]]) {
      const gr = g.createRadialGradient(x * w, y * w, 0, x * w, y * w, r * w);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  }),
  /** 露珠 */
  dew: () => canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w * 0.42, w * 0.4, 2, w / 2, w / 2, w * 0.36);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(200,232,250,0.95)'); gr.addColorStop(1, 'rgba(140,190,230,0.85)');
    g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w * 0.34, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(w * 0.4, w * 0.36, 5, 3, -0.6, 0, TAU); g.fill();
  }),
};

/** 冰窗材质：中间可以化开一个圆洞（uHole：0 = 没洞，按窗高的比例） */
function frostMaterial(tex, aspect) {
  const u = { uHole: { value: 0 }, uAspect: { value: aspect } };
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHole;\nuniform float uAspect;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 dd = vMapUv - vec2(0.5, 0.53); dd.x *= uAspect; float rr = length(dd);
          if (uHole > 0.001) diffuseColor.a *= smoothstep(uHole - 0.05, uHole + 0.015, rr); }`);
  };
  mat.customProgramCacheKey = () => 'tutFrost';
  mat.userData.u = u;
  return mat;
}

/** 一团沿弧线飞的东西（孩子的热气、Mochi 的小烟、飞走的种子、露珠…） */
class Mover {
  constructor(parent, tex, { color = 0xffffff, from, via = null, to, dur, size = [0.06, 0.06], fade = [0.15, 0.25], arc = 0, opacity = 1, onArrive = null, head = null, spin = 0 }) {
    this.m = quad(tex, { color });
    parent.add(this.m);
    Object.assign(this, { from: from.clone(), via: via?.clone() || null, to: to.clone(), dur, size, fade, opacity, onArrive, head, spin, t: 0, alive: true });
    this.c = this.via || from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, arc, 0));
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    bezier(this.from, this.c, this.to, ease.inOutSine(p), this.m.position);
    const s = lerp(this.size[0], this.size[1], p);
    this.m.scale.set(s, s, 1);
    const fi = this.fade[0] > 0 ? Math.min(1, p / this.fade[0]) : 1, fo = this.fade[1] > 0 ? Math.min(1, (1 - p) / this.fade[1]) : 1;
    this.m.material.opacity = this.opacity * fi * fo;
    if (this.head) faceHead(this.m, this.head, this.spin * this.t);
    this.m.renderOrder = depthOrder(this.m.position.z, 0.95);
    if (p >= 1) { this.alive = false; this.m.parent?.remove(this.m); this.onArrive?.(); }
    return this.alive;
  }
  kill() { this.alive = false; this.m.parent?.remove(this.m); }
}

// ───────────── 新手引导 ─────────────
export class Tutorial {
  static async create(world, deps) {
    const P = CONFIG.paths;
    const [fc, fo] = await Promise.all(['tut_flower_closed', 'tut_flower_open'].map((f) => tryLoadTexture([`${P.fx}${f}.png`, `${P.fx}${f}.PNG`])));
    return new Tutorial(world, deps, { flowerClosed: fc, flowerOpen: fo });
  }

  constructor(world, { mochi, fx, voice, head, audio, layout, template, settings }, tx) {
    this.world = world; this.mochi = mochi; this.fx = fx; this.voice = voice; this.head = head; this.audio = audio;
    this.layout = layout; this.template = template; this.getSettings = settings;
    this.tex = {
      glow: eggGen.glow(), frost: tutGen.frost(), puff: tutGen.puff(), dew: tutGen.dew(), seed: ambientGen.seed(),
      flowerClosed: tx.flowerClosed?.tex || null, flowerOpen: tx.flowerOpen?.tex || null,
      flowerAspect: tx.flowerClosed ? tx.flowerClosed.h / tx.flowerClosed.w : 1.9,
    };
    this.active = false; this.paused = false;
    this.props = []; this.movers = []; this.seqs = [];
    this.t = 0;
  }

  // ───── 对外 ─────
  get steps() {
    const all = ['wake', 'mirror', 'relax', 'smell', 'huff', 'cough', 'egg'];
    return all.filter((k) => k !== 'cough' || this.template.includeCough);
  }
  start(onDone) {
    this.stop(true);
    this.active = true; this.paused = false; this.onDone = onDone;
    this.list = this.steps; this.i = -1;
    console.log(`[引导] 开始：${this.list.join(' → ')}`);
    this._next();
  }
  stop(silent = false) {
    if (!this.active && silent) return;
    this.active = false;
    this.voice.stop();
    this._clear();
    Object.assign(this.mochi.extra, { lean: 0, x: 0, y: 0, shiver: 0 });
    this.mochi.faceToward(null);
  }
  pause() { this.paused = true; this.voice.stop(); }
  resume() { if (!this.active) return; this.paused = false; this._enter(this.i); }
  /** 家长按 Space：孩子做到了 */
  confirm() {
    const s = this.cur;
    if (!this.active || this.paused || !s || s.success || !s.def.confirm) return;
    this._complete(true, '家长确认');
  }
  /** 家长按 T：提示再进一级 */
  hint() {
    const s = this.cur;
    if (!this.active || this.paused || !s || s.success) return;
    if (s.level < s.def.lines.length) { this._say(s.def.lines[s.level]); s.level++; s.t = Math.max(s.t, this._hintAt(s, s.level - 1)); } else this._complete(false, '家长提示到底');
  }
  /** 家长按 S：跳过引导 */
  skip() { if (!this.active) return; console.log('[引导] 跳过'); const cb = this.onDone; this.stop(); cb?.(); }
  get canConfirm() { const s = this.cur; return !!(this.active && s && !s.success && s.def.confirm); }
  get label() {
    const s = this.cur;
    if (!s) return '新手引导';
    const n = this.list.length, idx = this.i + 1;
    const lv = s.def.lines.length ? ` · 提示 ${s.level}/${s.def.lines.length}` : '';
    if (!s.def.confirm) return `引导 ${idx}/${n} ${s.def.name}`;
    return `引导 ${idx}/${n} ${s.def.name}${s.success ? (s.byChild ? ' ✓ 孩子做到了' : ' · 世界自己完成') : lv}`;
  }

  /** 孩子嘴前飞出一团热气到 to（正式练习的哈气也用：让孩子看见“我的气 → Mochi 的火”） */
  childBreath(to, dur = CONFIG.tutorial.breathSec, via = null) {
    const from = this.head.local(0.14, 0.13);
    this.movers.push(new Mover(this.world, this.tex.puff, {
      color: 0xfff1dc, from, via, to, dur, size: [0.05, 0.16], fade: [0.15, 0.2], arc: 0.06, opacity: 0.95, head: this.head, spin: 1.2,
    }));
  }

  // ───── 内部 ─────
  get cur() { return this.state; }
  _say(id) { if (this.voice.has(id)) this.voice.say(id); }
  _hintAt(s, k) { return (s.def.hintAt || CONFIG.tutorial.hintAt)[k] ?? 1e9; }
  _prop(mesh) { this.world.add(mesh); this.props.push(mesh); return mesh; }
  _clear() {
    for (const L of this.layout.layers.values()) if (L.kind === 'fog') L.scaleMul = 1;
    for (const m of this.props) m.parent?.remove(m);
    for (const mv of this.movers) mv.kill();
    this.props = []; this.movers = []; this.seqs = []; this.scent = null; this.firefly = null; this.flower = null; this.frost = null; this.seed = null; this.dew = null;
    this.fogReact = null;
  }
  _after(sec, fn) { this.seqs.push(new Seq([{ dur: sec }, { dur: 0, start: fn }])); }
  _next() {
    this.i++;
    if (this.i >= this.list.length) {
      console.log('[引导] 完成 → 正式练习');
      const cb = this.onDone; this.stop(); cb?.();
      return;
    }
    this._enter(this.i);
  }
  _enter(i) {
    this.voice.stop();
    this._clear();
    Object.assign(this.mochi.extra, { lean: 0, x: 0, y: 0, shiver: 0 });
    const def = this[`_def_${this.list[i]}`]();
    this.state = { def, t: 0, level: 0, success: false, byChild: false, outT: 0 };
    console.log(`[引导] ${i + 1}/${this.list.length} ${def.name}`);
    def.enter?.();
  }
  _complete(byChild, why = '') {
    const s = this.state;
    if (!s || s.success) return;
    s.success = true; s.byChild = byChild;
    console.log(`[引导] ${s.def.name}：${byChild ? '孩子做到了' : '世界自己完成'}${why ? `（${why}）` : ''}，用到提示 ${s.level} 级`);
    s.outT = s.def.finish?.(byChild) ?? 1.5;
  }

  /** 每帧都跑（不管在不在引导里）：飞行中的热气、烟、露珠、种子 */
  tick(dt) { if (this.movers.length) this.movers = this.movers.filter((m) => m.update(dt)); }

  update(dt, t) {
    if (!this.active || this.paused || !this.state) return;
    this.t = t;
    const s = this.state, d = s.def;
    s.t += dt;
    for (const q of this.seqs) q.update(dt);
    this.seqs = this.seqs.filter((q) => !q.done);
    d.update?.(dt, t);
    if (!s.success) {
      // 提示阶梯：到点就念下一句（孩子已经做到了就不会走到这里）
      if (s.level < d.lines.length && s.t >= this._hintAt(s, s.level)) { this._say(d.lines[s.level]); s.level++; }
      if (s.t >= (d.autoAt ?? CONFIG.tutorial.autoAt)) this._complete(false, '世界自己完成');
    } else if ((s.outT -= dt) <= 0) {
      this._next();
    }
  }

  // ═════════════ 各段 ═════════════
  /** 看一看：孩子看着 Mochi，它就慢慢醒来；看看雾团，雾团会打个小哈欠 */
  _def_wake() {
    const m = this.mochi, T = CONFIG.tutorial;
    let acc = 0, stirred = false;
    const fogs = [...this.layout.layers.values()].filter((L) => L.kind === 'fog' && !L.melted);
    const react = new Map(fogs.map((L) => [L, { acc: 0, cool: 0, tw: new Tween(1) }]));
    return {
      name: '看一看', lines: ['wake_1', 'wake_2'], hintAt: [8, 16], autoAt: 26, confirm: true,
      enter: () => {
        m.setPose('sleep'); m.setWings('fold'); m.setHover(false); m.setWaitMode(false); m.calm();
        this.fx.zzz.set(true);
      },
      update: (dt) => {
        const target = _v.set(m.x.v, m.y.v + m.S * 0.35, m.z.v);
        const looking = this.head.angleTo(target) < T.gazeDeg;
        acc = looking ? acc + dt : Math.max(0, acc - dt * 0.5);
        if (!stirred && acc > T.wakeGazeSec * 0.4) { stirred = true; m.hop(CONFIG.mochi.hop.height * 0.35, 0.35); }
        if (acc >= T.wakeGazeSec && !this.state.success) this._complete(true, '孩子看着 Mochi');
        // 看着雾团：它打个小哈欠（鼓一下）
        for (const [L, r] of react) {
          if (L.melted) continue;
          r.cool -= dt;
          r.acc = this.head.angleTo(L.base) < 9 ? r.acc + dt : 0;
          if (r.acc > 0.8 && r.cool <= 0) { r.cool = 4; r.acc = 0; r.tw.go(1.1, 0.35, ease.outQuad, () => r.tw.go(1, 0.6, ease.inOutSine)); }
          L.scaleMul = r.tw.update(dt);
        }
      },
      finish: (byChild) => {
        for (const L of react.keys()) L.scaleMul = 1;
        m.wake(); this.fx.zzz.set(false); this.audio.loop('sfx_snore', false); m.faceToward(null);
        this._after(0.6, () => m.happy());
        if (byChild) this._say('wake_ok');
        return 2.4;
      },
    };
  }

  /** 你动我也动：Mochi 学孩子歪头、转头、抬头 */
  _def_mirror() {
    const m = this.mochi, h = this.head;
    let base = null, armed = true, gestures = 0;
    return {
      name: '你动我也动', lines: ['mirror_1', 'mirror_2', 'mirror_3'], hintAt: [10, 18, 26], autoAt: 36, confirm: true,
      enter: () => { m.setPose('stand'); m.setWaitMode(true); m.calm(); base = { yaw: h.yaw, pitch: h.pitch }; },
      update: () => {
        if (this.state.success) return;
        let yaw = h.yaw - base.yaw; if (yaw > 180) yaw -= 360; if (yaw < -180) yaw += 360;
        const yawR = clamp(yaw, -40, 40), pitchR = clamp(h.pitch - base.pitch, -30, 30), roll = clamp(h.roll, -30, 30);
        // 像照镜子：孩子往左歪/往左转，Mochi 也往孩子看到的左边歪/挪
        m.extra.lean = roll * 0.9 + yawR * 0.3;
        m.extra.x = -yawR * 0.003;
        m.extra.y = pitchR * 0.004;
        if (yawR > 16) m.faceToward(_w.set(m.x.v - 1, 0, 0)); else if (yawR < -16) m.faceToward(_w.set(m.x.v + 1, 0, 0)); else m.faceToward(null);
        // 数“动作”：头明显动一下再回来算一次；Mochi 每学一次就开心地弹一下
        const mag = Math.max(Math.abs(yawR) / 18, Math.abs(pitchR) / 12, Math.abs(roll) / 12);
        if (armed && mag > 1) { armed = false; gestures++; m.hop(CONFIG.mochi.hop.height * 0.3, 0.3); }
        if (mag < 0.45) armed = true;
        if (gestures >= 3 && this.state.t > 3) this._complete(true, `孩子动了 ${gestures} 下`);
      },
      finish: (byChild) => {
        Object.assign(m.extra, { lean: 0, x: 0, y: 0 });
        m.faceToward(null); m.setWaitMode(false); m.happy();
        if (byChild) this._say('mirror_ok');
        return 2.2;
      },
    };
  }

  /** 一起放松：孩子安静下来，萤火虫慢慢靠近；一动它就退后一点在原地等 */
  _def_relax() {
    const m = this.mochi, T = CONFIG.tutorial;
    let p = 0, best = 0, landed = false;
    const start = new THREE.Vector3(-1.4, 1.75, -2.6), rest = new THREE.Vector3(...T.fireflyRest);
    const ctrl = new THREE.Vector3(-0.2, 1.9, -1.4);
    return {
      name: '一起放松', lines: ['relax_1', 'relax_2', 'relax_3'], autoAt: 40, confirm: true,
      enter: () => {
        m.setPose('stand'); m.calm();
        m.yawn(() => { m.setPose('sleep'); this.fx.zzz.set(true); });
        const core = this._prop(quad(this.tex.glow, { color: 0xffe9a8 }));
        const halo = this._prop(quad(this.tex.glow, { additive: true, color: 0xffc860 }));
        this.firefly = { core, halo };
      },
      update: (dt, t) => {
        if (!this.firefly) return;
        if (!landed) {
          const still = this.head.speed < T.stillDegPerSec;
          p = still ? p + dt / T.fireflyApproachSec : Math.max(best - 0.3, 0, p - dt / 10);
          p = Math.min(1, p); best = Math.max(best, p);
          if (p >= 1 && !this.state.success) this._complete(true, '孩子安静下来，萤火虫落下了');
        }
        const e = ease.inOutSine(p);
        bezier(start, ctrl, rest, e, _v);
        const wob = (1 - e * 0.85) * 0.06;
        _v.x += Math.sin(t * 2.3) * wob; _v.y += Math.sin(t * 3.1 + 1) * wob * 0.7;
        const pulse = 0.65 + 0.35 * (0.5 - 0.5 * Math.cos((t * TAU) / CONFIG.mochi.sleepBreath.period)); // 跟 Mochi 呼吸同一个慢节奏
        const { core, halo } = this.firefly;
        core.position.copy(_v); halo.position.copy(_v);
        const cs = 0.035 * (landed ? 1.2 : 1), hs = 0.16 * pulse * (landed ? 1.3 : 1);
        core.scale.set(cs, cs, 1); halo.scale.set(hs, hs, 1);
        core.material.opacity = 1; halo.material.opacity = 0.9 * pulse;
        faceHead(core, this.head); faceHead(halo, this.head);
        core.renderOrder = depthOrder(_v.z, 0.96); halo.renderOrder = depthOrder(_v.z, 0.955);
      },
      finish: (byChild) => {
        p = 1; landed = true;
        if (byChild) this._say('relax_ok');
        return 3.2;
      },
    };
  }

  /** 吸-停-呼：鼻子前的花开了，孩子闻一闻 → 香味被吸进去，Mochi 跟着飘起来、停一下、落下 */
  _def_smell() {
    const m = this.mochi, T = CONFIG.tutorial, tp = this.template, s = this.getSettings();
    let base = null, opened = 0, emitAcc = 0, longing = 0, finishing = false;
    const scent = [];
    const nose = () => this.head.local(0.06, 0.07);
    return {
      name: '闻一闻（吸-停-呼）', lines: ['smell_1', 'smell_2', 'smell_3'], autoAt: 38, confirm: true,
      enter: () => {
        m.wake(); this.fx.zzz.set(false); this.audio.loop('sfx_snore', false); m.faceToward(null); m.setWaitMode(true);
        const fw = T.flowerH / this.tex.flowerAspect;
        // 花朵中心对着鼻子，离脸约 42 cm；花从下面慢慢升上来
        base = this.head.local(T.flowerDist, 0.07);
        base.y -= T.flowerH * (0.5 - T.flowerHeadFromTop);
        const closed = this._prop(quad(this.tex.flowerClosed || this.tex.glow));
        const open = this._prop(quad(this.tex.flowerOpen || this.tex.glow));
        open.material.opacity = 0;
        this.flower = { closed, open, w: fw, rise: new Tween(0).go(1, 1.6, ease.outCubic), open: open, openT: new Tween(0), fade: new Tween(1) };
        this.flower.closedM = closed;
        this._after(2.4, () => this.flower?.openT.go(1, 1.4, ease.inOutSine));
      },
      update: (dt, t) => {
        const F = this.flower; if (!F) return;
        const r = F.rise.update(dt), o = F.openT.update(dt), fd = F.fade.update(dt);
        opened = o;
        const pos = _v.copy(base); pos.y -= (1 - r) * 0.28;
        const tremble = (1 - o) * Math.sin(t * 13) * 2.2 * DEG + Math.sin(t * 1.3) * 1.5 * DEG;
        for (const [mesh, a] of [[F.closedM, (1 - o) * fd], [F.open, o * fd]]) {
          mesh.position.copy(pos);
          const pop = 1 + 0.08 * Math.sin(Math.PI * o);
          mesh.scale.set(F.w * pop, T.flowerH * pop, 1);
          faceHead(mesh, this.head, tremble);
          mesh.material.opacity = a;
          mesh.renderOrder = depthOrder(pos.z, mesh === F.open ? 0.91 : 0.9);
        }
        F.head = pos.clone().add(new THREE.Vector3(0, T.flowerH * (0.5 - T.flowerHeadFromTop), 0.01));
        // Mochi 只表现“想飞但够不着”：时不时抬头望天、蹦一下
        if (!this.state.success && (longing -= dt) <= 0) { longing = 3.6; m.lookUp(1.1); this._after(0.4, () => m.hop(CONFIG.mochi.hop.height * 0.8, 0.5)); }
        // 香味丝带：花开了以后往孩子鼻子飘
        if (o > 0.6 && !finishing) {
          emitAcc += dt * 5;
          while (emitAcc >= 1) {
            emitAcc -= 1;
            const from = F.head.clone().add(new THREE.Vector3(rand(-0.03, 0.03), rand(-0.02, 0.03), 0));
            const to = nose();
            const via = from.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-0.08, 0.08), rand(0.02, 0.08), 0));
            const mv = new Mover(this.world, this.tex.glow, { color: 0xffcf5a, from, via, to, dur: rand(2.2, 3.0), size: [0.016, 0.01], fade: [0.2, 0.3], opacity: 0.95, head: this.head });
            scent.push(mv); this.movers.push(mv);
          }
        }
      },
      finish: (byChild) => {
        finishing = true;
        const B = s.band, inhale = tp.inhaleSec, hold = tp.holdSec, exhale = tp.exhaleSec;
        // 香味一下子被吸进鼻子
        for (const mv of scent) if (mv.alive) { mv.from.copy(mv.m.position); mv.c.copy(mv.from).lerp(nose(), 0.5); mv.to.copy(nose()); mv.t = 0; mv.dur = 0.45; }
        if (byChild) this._say('smell_ok');
        // Mochi 被托着飞起来（= 正式练习里的“吸气上升”）
        m.setWaitMode(false); m.setWings('flap'); m.flyY(B.center, inhale, ease.inOutSine); m.setBelly(CONFIG.mochi.inhaleBelly, inhale);
        this._after(inhale, () => {
          m.setHover(true); m.setWings('hover'); m.setEyes('happy');
          if (this.flower) {
            const d = this._prop(quad(this.tex.dew));
            this.dew = { mesh: d, t: 0 };
            const F = this.flower;
            this.seqs.push(new Seq([{ dur: hold, update: (p, dtt) => {
              const pos = F.head.clone().add(new THREE.Vector3(Math.sin(this.t * 7) * 0.006, 0.075, 0.02));
              d.position.copy(pos); const sc = 0.03 * Math.min(1, p * 4); d.scale.set(sc, sc, 1); faceHead(d, this.head); d.renderOrder = depthOrder(pos.z, 0.97);
            } }]));
          }
          this._say('smell_hold');
        });
        this._after(inhale + hold, () => {
          m.setHover(false); m.setEyes('open'); m.setWings('glide'); m.flyY(this.getSettings().groundY, exhale, ease.inOutSine); m.setBelly(1, exhale);
          this._say('smell_down');
          // 露珠稳稳飘进窝里
          if (this.dew) {
            const d = this.dew.mesh; d.parent?.remove(d);
            this.movers.push(new Mover(this.world, this.tex.dew, { from: d.position.clone(), to: this.fx.egg.center().clone().add(new THREE.Vector3(-0.1, 0.05, 0.05)), dur: exhale, size: [0.03, 0.02], fade: [0, 0.2], arc: 0.25, head: this.head }));
          }
        });
        this._after(inhale + hold + exhale, () => { m.setWings('fold'); this.flower?.fade.go(0, 0.8); });
        return inhale + hold + exhale + 1.0;
      },
    };
  }

  /** 哈气：冰窗后面的 Mochi 冷得发抖 → 孩子哈气 → 冰窗化开、热气飞进 Mochi 嘴里、火苗变大 */
  _def_huff() {
    const m = this.mochi, T = CONFIG.tutorial;
    let smoke = 0, win = null;
    return {
      name: '哈一哈', lines: ['huff_1', 'huff_2', 'huff_3'], autoAt: 38, confirm: true,
      enter: () => {
        m.setPose('stand'); m.faceToward(null); m.setWaitMode(false); m.calm();
        m.extra.shiver = 1;
        const aspect = 512 / 400, w = T.frostW, h = w / aspect;
        const mesh = this._prop(new THREE.Mesh(PLANE, frostMaterial(this.tex.frost, aspect)));
        mesh.rotation.order = 'YXZ';
        const pos = this.head.local(T.frostDist, T.frostDown);
        win = { mesh, pos, w, h, hole: new Tween(0), fade: new Tween(0).go(1, 0.8) };
        this.frost = win;
      },
      update: (dt) => {
        if (win) {
          win.mesh.position.copy(win.pos);
          win.mesh.scale.set(win.w, win.h, 1);
          faceHead(win.mesh, this.head);
          win.mesh.material.userData.u.uHole.value = win.hole.update(dt);
          win.mesh.material.opacity = win.fade.update(dt);
          win.mesh.visible = win.mesh.material.opacity > 0.003;
          win.mesh.renderOrder = depthOrder(win.pos.z, 0.92);
        }
        // Mochi 只表现“冷、火苗快熄了”：发抖，嘴里时不时冒出一小缕烟
        if (!this.state.success && (smoke -= dt) <= 0) {
          smoke = 2.6;
          const from = m.mouthWorld();
          this.movers.push(new Mover(this.world, this.tex.puff, { color: 0xbdb6cc, from, to: from.clone().add(new THREE.Vector3(0.05, 0.22, 0.02)), dur: 1.4, size: [0.03, 0.09], fade: [0.2, 0.5], opacity: 0.8, head: this.head }));
        }
      },
      finish: (byChild) => {
        const mouth = m.mouthWorld();
        const warm = () => {
          m.extra.shiver = 0;
          m.huff(() => this.fx.flames.shoot(m.mouthWorld(), m.mouthWorld().add(new THREE.Vector3(0.32, 0.24, 0.12)), { demo: true }));
          this._after(0.8, () => m.happy({ spin: true }));
        };
        if (byChild) {
          // 孩子的热气：先打到冰窗上化开一个洞，再穿过去飞进 Mochi 嘴里
          this.childBreath(mouth, T.breathSec + 0.35, win ? win.pos : null);
          this._after(T.breathSec * 0.45, () => win?.hole.go(T.frostHole, 0.8, ease.outCubic));
          this._after(T.breathSec + 0.35, warm);
          this._after(T.breathSec + 1.4, () => this._say('huff_ok'));
        } else {
          win?.hole.go(T.frostHole, 3.0, ease.inOutSine);
          this._after(2.4, warm);
        }
        this._after(byChild ? 3.6 : 4.6, () => win?.fade.go(0, 0.9));
        return byChild ? 4.8 : 5.8;
      },
    };
  }

  /** 咳嗽（只在模板 includeCough 时）：种子卡在 Mochi 喉咙里。只请一次，不加码 */
  _def_cough() {
    const m = this.mochi;
    let seed = null;
    return {
      name: '咳一咳（可选）', lines: ['cough_1', 'cough_3'], hintAt: [6, 14], autoAt: 24, confirm: true,
      enter: () => {
        m.setPose('stand'); m.calm(); m.extra.shiver = 0.3;
        seed = this._prop(quad(this.tex.seed));
      },
      update: (dt, t) => {
        if (!seed || !seed.parent) return;
        const p = m.mouthWorld().add(new THREE.Vector3(0.02, Math.sin(t * 6) * 0.01, 0.03));
        seed.position.copy(p); seed.scale.set(0.07, 0.07, 1); faceHead(seed, this.head, Math.sin(t * 5) * 0.4);
        seed.renderOrder = depthOrder(p.z, 0.97);
      },
      finish: (byChild) => {
        m.extra.shiver = 0;
        m.sneeze(() => {
          const from = seed?.position.clone() || m.mouthWorld();
          seed?.parent?.remove(seed);
          this.movers.push(new Mover(this.world, this.tex.seed, { from, to: from.clone().add(new THREE.Vector3(0.9, 0.9, -0.4)), dur: 1.6, size: [0.07, 0.05], fade: [0, 0.3], arc: 0.2, head: this.head, spin: 2 }));
          if (byChild) this._after(0.5, () => this._say('cough_ok'));
        });
        return 2.6;
      },
    };
  }

  /** 收尾：Mochi 看看冰凉的龙蛋，再看看孩子 → 进入正式练习 */
  _def_egg() {
    const m = this.mochi;
    return {
      name: '龙蛋好冰', lines: [], autoAt: 6.5, confirm: false,
      enter: () => {
        m.setPose('stand'); m.calm(); m.faceToward(this.fx.egg.center());
        this._after(0.9, () => { const e = this.fx.egg; if (!e.hatched) { e.wobAge = 0; e.wobDeg = 5; } });
        this._after(2.0, () => { m.faceToward(null); this._say('egg_1'); });
      },
      finish: () => 0.3,
    };
  }
}
