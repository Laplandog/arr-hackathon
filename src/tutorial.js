// 新手引导「Mochi 醒来的第一天」：孩子自己摸索玩法，不照说明书做。
//
// 规则：孩子带头，Mochi 学孩子。Mochi 从不先示范动作，只表现“它怎么了”（困、冷、够不着云、卡住了…）。
// 每一段：先安静等几秒（孩子可能自己就发现了）→ 旁白第 1 句说 Mochi 怎么了 → 第 2 句给线索 → 第 3 句才说怎么帮。
// 孩子任何时候做到了（家长按 Space，或者头显自动判断），立刻有结果；后面的提示就不会再播。
// 一直没做也没关系：最后世界自己慢慢完成，照样往下走（没有失败、没有倒计时压力）。
//
//   wake    看一看：孩子看着 Mochi，它就慢慢醒来（头显朝向，自动）
//   mirror  你动我也动：Mochi 学孩子歪头、转头、抬头（头显，自动）
//   relax   一起放松：孩子安静下来，害羞的萤火虫才会靠近（头显，自动）
//   inhale  吸-停-呼：一群萤火虫在面前飞 → 孩子吸气把它们“请过来” → 萤火虫托着 Mochi 飞起来；
//           停一下时一颗水滴从天上慢慢落到 Mochi 头上；呼气时 Mochi 降落（家长确认）
//   huff    哈气：Mochi 冻成冰蓝色、发抖、冒冷气 → 孩子哈气 → 热气飞进 Mochi 嘴里，颜色慢慢变回来、火苗变大（家长确认）
//   cough   咳嗽（只在模板 includeCough 时）：种子卡在 Mochi 喉咙里，难受的表情；只请一次，不加码（家长确认）
//   egg     收尾：Mochi 看看冰凉的龙蛋，再看看孩子 → 进入正式练习
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PLANE } from './layout.js';
import { canvasTexture } from './assets.js';
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
/** 让平面正对孩子的头（左右 + 上下） */
function faceHead(mesh, head, roll = 0) {
  const p = mesh.position, dx = head.pos.x - p.x, dy = head.pos.y - p.y, dz = head.pos.z - p.z;
  mesh.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), roll, 'YXZ');
}

// ───────────── 代码画的道具贴图 ─────────────
export const tutGen = {
  /** 一团软软的气 */
  puff: () => canvasTexture(128, 128, (g, w) => {
    for (const [x, y, r] of [[0.5, 0.55, 0.3], [0.32, 0.5, 0.2], [0.68, 0.5, 0.22], [0.45, 0.36, 0.2], [0.6, 0.38, 0.17]]) {
      const gr = g.createRadialGradient(x * w, y * w, 0, x * w, y * w, r * w);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  }),
  /** 水滴：上尖下圆 */
  drop: () => canvasTexture(64, 96, (g, w, h) => {
    const cx = w / 2, cy = h * 0.64, r = w * 0.34;
    g.beginPath();
    g.moveTo(cx, h * 0.06);
    g.bezierCurveTo(cx + r * 0.25, h * 0.26, cx + r * 1.02, cy - r * 0.55, cx + r, cy);
    g.arc(cx, cy, r, 0, Math.PI);
    g.bezierCurveTo(cx - r * 1.02, cy - r * 0.55, cx - r * 0.25, h * 0.26, cx, h * 0.06);
    g.closePath();
    const gr = g.createLinearGradient(0, h * 0.06, 0, h * 0.95);
    gr.addColorStop(0, 'rgba(214,238,255,0.95)'); gr.addColorStop(1, 'rgba(120,180,235,0.95)');
    g.fillStyle = gr; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.15, r * 0.16, r * 0.3, -0.35, 0, TAU); g.fill();
  }),
  /** 发抖的符号：三道弯弯的短线 ))) */
  shake: () => canvasTexture(96, 128, (g, w, h) => {
    g.lineCap = 'round';
    for (const [k, r] of [[0, 26], [1, 42], [2, 58]]) {
      const a0 = -0.55 + k * 0.06, a1 = 0.55 - k * 0.06;
      for (const [col, lw] of [['rgba(255,255,255,0.95)', 9], ['rgba(110,160,225,1)', 5]]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.arc(4, h / 2, r, a0, a1); g.stroke();
      }
    }
  }),
  /** 小雪花 */
  snow: () => canvasTexture(64, 64, (g, w) => {
    g.lineCap = 'round';
    for (const [col, lw] of [['rgba(120,170,230,0.9)', 6], ['rgba(255,255,255,1)', 3]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3, c = w / 2, L = w * 0.4;
        g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L); g.stroke();
        const bx = c + Math.cos(a) * L * 0.6, by = c + Math.sin(a) * L * 0.6;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + s * 0.8) * L * 0.3, by + Math.sin(a + s * 0.8) * L * 0.3); g.stroke(); }
      }
    }
  }),
};

/** 一团沿弧线飞的东西（孩子的热气、Mochi 的冷气、飞走的种子、水滴…） */
class Mover {
  constructor(parent, tex, { color = 0xffffff, from, via = null, to, dur, size = [0.06, 0.06], fade = [0.15, 0.25], arc = 0, opacity = 1, onArrive = null, head = null, spin = 0, aspect = 1 }) {
    this.m = quad(tex, { color });
    parent.add(this.m);
    Object.assign(this, { from: from.clone(), via: via?.clone() || null, to: to.clone(), dur, size, fade, opacity, onArrive, head, spin, aspect, t: 0, alive: true });
    this.c = this.via || from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, arc, 0));
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const p = Math.min(1, this.t / this.dur);
    bezier(this.from, this.c, this.to, ease.inOutSine(p), this.m.position);
    const s = lerp(this.size[0], this.size[1], p);
    this.m.scale.set(s, s * this.aspect, 1);
    const fi = this.fade[0] > 0 ? Math.min(1, p / this.fade[0]) : 1, fo = this.fade[1] > 0 ? Math.min(1, (1 - p) / this.fade[1]) : 1;
    this.m.material.opacity = this.opacity * fi * fo;
    if (this.head) faceHead(this.m, this.head, this.spin * this.t);
    this.m.renderOrder = depthOrder(this.m.position.z, 0.95);
    if (p >= 1) { this.alive = false; this.m.parent?.remove(this.m); this.onArrive?.(); }
    return this.alive;
  }
  kill() { this.alive = false; this.m.parent?.remove(this.m); }
}

/** 一只萤火虫：普通混合的暖黄色小光点 + 加法混合的光晕（灰天空上也看得清） */
class Firefly {
  constructor(tut, glow) {
    this.core = tut._prop(quad(glow, { color: 0xffe9a8 }));
    this.halo = tut._prop(quad(glow, { additive: true, color: 0xffc860 }));
    this.pos = new THREE.Vector3(); this.alpha = 1; this.size = 1;
  }
  draw(head, pulse) {
    for (const m of [this.core, this.halo]) m.position.copy(this.pos);
    const cs = 0.035 * this.size, hs = 0.16 * pulse * this.size;
    this.core.scale.set(cs, cs, 1); this.halo.scale.set(hs, hs, 1);
    this.core.material.opacity = this.alpha; this.halo.material.opacity = 0.9 * pulse * this.alpha;
    faceHead(this.core, head); faceHead(this.halo, head);
    this.core.renderOrder = depthOrder(this.pos.z, 0.96); this.halo.renderOrder = depthOrder(this.pos.z, 0.955);
  }
}

// ───────────── 新手引导 ─────────────
export class Tutorial {
  static async create(world, deps) { return new Tutorial(world, deps); }

  constructor(world, { mochi, fx, voice, head, audio, layout, template, settings }) {
    this.world = world; this.mochi = mochi; this.fx = fx; this.voice = voice; this.head = head; this.audio = audio;
    this.layout = layout; this.template = template; this.getSettings = settings;
    this.tex = { glow: eggGen.glow(), puff: tutGen.puff(), drop: tutGen.drop(), shake: tutGen.shake(), snow: tutGen.snow(), seed: ambientGen.seed() };
    this.active = false; this.paused = false;
    this.props = []; this.movers = []; this.seqs = [];
    this.t = 0;
  }

  // ───── 对外 ─────
  get steps() {
    const all = ['wake', 'mirror', 'relax', 'inhale', 'huff', 'cough', 'egg'];
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
    this._resetMochi();
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
  _resetMochi() {
    const m = this.mochi;
    Object.assign(m.extra, { lean: 0, x: 0, y: 0, shiver: 0 });
    if (m.cold.to > 0) m.cold.go(0, 0.6);
    m.forcePose = null;
  }
  _clear() {
    for (const L of this.layout.layers.values()) if (L.kind === 'fog') L.scaleMul = 1;
    for (const m of this.props) m.parent?.remove(m);
    for (const mv of this.movers) mv.kill();
    this.props = []; this.movers = []; this.seqs = [];
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
    this._resetMochi();
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

  /** 每帧都跑（不管在不在引导里）：飞行中的热气、冷气、水滴、种子 */
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
    let p = 0, best = 0, landed = false, ff = null;
    const start = new THREE.Vector3(-1.4, 1.75, -2.6), rest = new THREE.Vector3(...T.fireflyRest);
    const ctrl = new THREE.Vector3(-0.2, 1.9, -1.4);
    return {
      name: '一起放松', lines: ['relax_1', 'relax_2', 'relax_3'], autoAt: 40, confirm: true,
      enter: () => {
        m.setPose('stand'); m.calm();
        m.yawn(() => { m.setPose('sleep'); this.fx.zzz.set(true); });
        ff = new Firefly(this, this.tex.glow);
      },
      update: (dt, t) => {
        if (!landed) {
          const still = this.head.speed < T.stillDegPerSec;
          p = still ? p + dt / T.fireflyApproachSec : Math.max(best - 0.3, 0, p - dt / 10);
          p = Math.min(1, p); best = Math.max(best, p);
          if (p >= 1 && !this.state.success) this._complete(true, '孩子安静下来，萤火虫落下了');
        }
        const e = ease.inOutSine(p);
        bezier(start, ctrl, rest, e, ff.pos);
        const wob = (1 - e * 0.85) * 0.06;
        ff.pos.x += Math.sin(t * 2.3) * wob; ff.pos.y += Math.sin(t * 3.1 + 1) * wob * 0.7;
        ff.size = landed ? 1.25 : 1;
        ff.draw(this.head, 0.65 + 0.35 * (0.5 - 0.5 * Math.cos((t * TAU) / CONFIG.mochi.sleepBreath.period))); // 跟 Mochi 呼吸同一个慢节奏
      },
      finish: (byChild) => {
        p = 1; landed = true;
        if (byChild) this._say('relax_ok');
        return 3.2;
      },
    };
  }

  /**
   * 吸-停-呼：一群萤火虫在孩子面前飞，时不时往孩子脸前凑一凑。
   * 孩子吸气（家长确认）→ 萤火虫被“请”到脸前，再一起飞到 Mochi 身下，把它托起来；
   * 停一下：一颗水滴从天上慢慢落到 Mochi 头上；呼气：萤火虫托着 Mochi 慢慢降落，水滴滑进窝里。
   */
  _def_inhale() {
    const m = this.mochi, T = CONFIG.tutorial, tp = this.template;
    let flies = [], home = null, mode = 'idle', mt = 0, longing = 0, beckon = 0, drop = null;
    const face = () => this.head.local(0.14, 0.06);
    const under = (f, out) => out.set(m.root.position.x + f.ring.x, m.root.position.y - m.S * 0.5 + f.ring.y, m.root.position.z + f.ring.z);
    return {
      name: '吸一吸（吸-停-呼）', lines: ['inhale_1', 'inhale_2', 'inhale_3'], autoAt: 38, confirm: true,
      enter: () => {
        m.wake(); this.fx.zzz.set(false); this.audio.loop('sfx_snore', false); m.faceToward(null); m.setWaitMode(true);
        home = this.head.local(T.swarmDist, T.swarmDown);
        const [sx, sy, sz] = T.swarmSpread;
        flies = Array.from({ length: T.swarmCount }, (_, i) => {
          const f = new Firefly(this, this.tex.glow);
          f.off = new THREE.Vector3(rand(-sx, sx), rand(-sy, sy), rand(-sz, sz));
          f.ph = rand(0, TAU); f.alpha = 0;
          const a = (i / T.swarmCount) * TAU;
          f.ring = new THREE.Vector3(Math.cos(a) * 0.24, rand(-0.02, 0.1), Math.sin(a) * 0.12 + 0.05);
          f.from = new THREE.Vector3(); f.mid = new THREE.Vector3();
          return f;
        });
      },
      update: (dt, t) => {
        mt += dt;
        // Mochi 只表现“想飞但够不着”：时不时抬头望天、蹦一下
        if (mode === 'idle' && (longing -= dt) <= 0) { longing = 3.6; m.lookUp(1.1); this._after(0.4, () => m.hop(CONFIG.mochi.hop.height * 0.8, 0.5)); }
        if (mode === 'idle') beckon = Math.max(0, Math.sin((this.state.t * TAU) / 5)) ** 2; // 每 5 秒往孩子脸前凑一凑
        const fc = face();
        flies.forEach((f, i) => {
          const wob = _w.set(Math.sin(t * 1.7 + f.ph) * 0.05, Math.sin(t * 2.3 + f.ph * 1.3) * 0.035, Math.sin(t * 1.1 + f.ph) * 0.03);
          if (mode === 'idle') {
            f.alpha = Math.min(1, f.alpha + dt * 0.8); f.size = 1.4;
            f.pos.copy(home).add(f.off).add(wob).lerp(fc, beckon * 0.35);
          } else if (mode === 'pull') { // 被孩子的吸气“请”到脸前
            const p = Math.min(1, mt / 0.6);
            f.pos.lerpVectors(f.from, _v.copy(fc).add(f.off.clone().multiplyScalar(0.35)), ease.inOutSine(p));
            f.size = 1.4 + 0.3 * p;
          } else if (mode === 'carry') { // 飞到 Mochi 身下托住它
            const p = Math.min(1, mt / 1.0);
            under(f, _v);
            if (p < 1) bezier(f.from, f.mid, _v, ease.inOutSine(p), f.pos); else f.pos.copy(_v).add(wob.multiplyScalar(0.6));
            f.size = lerp(1.7, 2.0, p);
          } else if (mode === 'scatter') { // 降落后各自飞走
            f.pos.y += dt * 0.25; f.pos.x += Math.sin(f.ph) * dt * 0.2;
            f.alpha = Math.max(0, f.alpha - dt * 0.7);
          }
          f.draw(this.head, 0.75 + 0.25 * Math.sin(t * 3 + i));
        });
        // 水滴：落到 Mochi 头上以后跟着它
        if (drop?.on) {
          const ht = m.headTopWorld();
          if (drop.falling) {
            const p = Math.min(1, drop.t / drop.dur); drop.t += dt;
            drop.mesh.position.lerpVectors(drop.from, ht, ease.inOutSine(p));
            drop.mesh.position.x += Math.sin(p * Math.PI * 3) * 0.04 * (1 - p);
            if (p >= 1) { drop.falling = false; this.fx.sparks.burst(ht, 10, { speed: 0.25, up: 0.1, life: [0.4, 0.8], size: [0.012, 0.024], colors: ['#dff2ff', '#ffffff', '#a8d4ff'], spread: 0.04, grav: 0 }); }
          } else drop.mesh.position.copy(ht).add(_v.set(0, 0.06, 0.02));
          drop.mesh.scale.set(0.1, 0.15, 1);
          faceHead(drop.mesh, this.head);
          drop.mesh.renderOrder = depthOrder(drop.mesh.position.z, 0.97);
        }
      },
      finish: (byChild) => {
        const B = this.getSettings().band, inhale = tp.inhaleSec, hold = tp.holdSec, exhale = tp.exhaleSec;
        const pull = 0.6;
        mode = 'pull'; mt = 0;
        for (const f of flies) { f.from.copy(f.pos); f.alpha = 1; }
        if (byChild) this._say('inhale_ok');
        this._after(pull, () => {
          mode = 'carry'; mt = 0;
          for (const f of flies) {
            f.from.copy(f.pos);
            under(f, f.mid); f.mid.lerp(f.from, 0.5); f.mid.y += 0.35;
          }
          // Mochi 被萤火虫托着飞起来（= 正式练习里的“吸气上升”）
          m.setWaitMode(false); m.setWings('flap'); m.flyY(B.center, inhale - pull, ease.inOutSine); m.setBelly(CONFIG.mochi.inhaleBelly, inhale - pull);
        });
        this._after(inhale, () => {
          m.setHover(true); m.setWings('hover'); m.setEyes('happy');
          const from = m.headTopWorld().add(new THREE.Vector3(0.05, T.dropFall, 0));
          drop = { on: true, falling: true, t: 0, dur: hold, from, mesh: this._prop(quad(this.tex.drop)) };
          this._say('inhale_hold');
        });
        this._after(inhale + hold, () => {
          m.setHover(false); m.setEyes('open'); m.setWings('glide'); m.flyY(this.getSettings().groundY, exhale, ease.inOutSine); m.setBelly(1, exhale);
          this._say('inhale_down');
        });
        this._after(inhale + hold + exhale, () => {
          m.setWings('fold'); mode = 'scatter';
          // 水滴从 Mochi 头上滑进窝里（龙蛋旁边）
          if (drop) {
            drop.on = false; drop.mesh.parent?.remove(drop.mesh);
            this.movers.push(new Mover(this.world, this.tex.drop, { from: drop.mesh.position.clone(), to: this.fx.egg.center().clone().add(new THREE.Vector3(-0.12, -0.02, 0.06)), dur: 0.9, size: [0.1, 0.06], aspect: 1.5, fade: [0, 0.25], arc: 0.12, head: this.head }));
          }
        });
        return inhale + hold + exhale + 1.4;
      },
    };
  }

  /** 哈气：Mochi 冻成冰蓝色、发抖、冒冷气 → 孩子哈气 → 热气飞进 Mochi 嘴里，颜色慢慢变回来、火苗变大 */
  _def_huff() {
    const m = this.mochi, T = CONFIG.tutorial;
    let smoke = 0, marks = null, flakes = [], coldVis = new Tween(0), glow = null;
    return {
      name: '哈一哈', lines: ['huff_1', 'huff_2', 'huff_3'], autoAt: 38, confirm: true,
      enter: () => {
        m.setPose('stand'); m.faceToward(null); m.setWaitMode(false); m.calm(); this.fx.zzz.set(false);
        m.cold.go(1, 1.2); m.extra.shiver = 1;
        m.forcePose = 'cold'; // 美术交了 mochi_pose_cold（冷得缩成一团的表情）就用它，没有就用平常的站姿
        coldVis.go(1, 1.2);
        marks = [this._prop(quad(this.tex.shake)), this._prop(quad(this.tex.shake))];
        flakes = Array.from({ length: 5 }, (_, i) => ({ mesh: this._prop(quad(this.tex.snow)), t: (i / 5) * 2.6, x: rand(-0.35, 0.35), ph: rand(0, TAU) }));
        glow = this._prop(quad(this.tex.glow, { additive: true, color: 0xffa860 }));
        glow.visible = false;
      },
      update: (dt, t) => {
        const cv = coldVis.update(dt), S = m.S, c = m.root.position;
        // 发抖的符号：Mochi 两边各三道弯线，左右交替闪
        marks.forEach((mk, i) => {
          const side = i === 0 ? -1 : 1, on = 0.55 + 0.45 * Math.sign(Math.sin(t * TAU * 3 + i * Math.PI));
          mk.position.set(c.x + side * S * 0.5 + Math.sin(t * 50 + i) * 0.006, c.y + S * 0.05, c.z + 0.06);
          mk.scale.set(side * S * 0.26, S * 0.35, 1);
          faceHead(mk, this.head);
          mk.rotation.z = 0;
          mk.material.opacity = cv * on;
          mk.visible = cv > 0.01;
          mk.renderOrder = depthOrder(c.z + 0.06, 0.9);
        });
        // 小雪花在 Mochi 身边飘下来
        for (const f of flakes) {
          f.t = (f.t + dt) % 2.6;
          const p = f.t / 2.6;
          f.mesh.position.set(c.x + f.x + Math.sin(t * 1.5 + f.ph) * 0.05, c.y + S * (0.7 - p * 1.0), c.z + 0.08);
          const s = 0.045 * (0.7 + 0.3 * Math.sin(f.ph));
          f.mesh.scale.set(s, s, 1);
          faceHead(f.mesh, this.head, t * 0.8 + f.ph);
          f.mesh.material.opacity = cv * Math.min(1, p / 0.15, (1 - p) / 0.2);
          f.mesh.visible = cv > 0.01;
          f.mesh.renderOrder = depthOrder(c.z + 0.08, 0.92);
        }
        // 嘴里时不时冒出一小缕冷气（小火苗快熄了）
        if (!this.state.success && (smoke -= dt) <= 0) {
          smoke = 2.6;
          const from = m.mouthWorld();
          this.movers.push(new Mover(this.world, this.tex.puff, { color: 0xcfe2f7, from, to: from.clone().add(new THREE.Vector3(0.05, 0.22, 0.02)), dur: 1.4, size: [0.03, 0.09], fade: [0.2, 0.5], opacity: 0.85, head: this.head }));
        }
        // 变暖时身上一圈暖光
        if (glow.visible) {
          glow.position.set(c.x, c.y + S * 0.05, c.z + 0.04);
          faceHead(glow, this.head);
          glow.renderOrder = depthOrder(c.z + 0.04, 0.85);
        }
      },
      finish: (byChild) => {
        const warm = () => {
          m.cold.go(0, 2.4, ease.inOutSine); m.extra.shiver = 0; coldVis.go(0, 0.8); m.forcePose = null;
          glow.visible = true;
          this.seqs.push(new Seq([{ dur: 1.8, update: (p) => {
            const k = Math.sin(Math.PI * p); const s = m.S * (0.9 + 0.5 * p);
            glow.scale.set(s, s, 1); glow.material.opacity = 0.85 * k;
          }, end: () => { glow.visible = false; } }]));
          m.huff(() => this.fx.flames.shoot(m.mouthWorld(), m.mouthWorld().add(new THREE.Vector3(0.32, 0.24, 0.12)), { demo: true }));
          this._after(0.9, () => m.happy({ spin: true }));
        };
        if (byChild) {
          this.childBreath(m.mouthWorld(), T.breathSec);
          this._after(T.breathSec, warm);
          this._after(T.breathSec + 1.1, () => this._say('huff_ok'));
        } else {
          this._after(1.2, warm);
        }
        return byChild ? 4.6 : 5.0;
      },
    };
  }

  /** 咳嗽（只在模板 includeCough 时）：种子卡在 Mochi 喉咙里，难受的表情。只请一次，不加码 */
  _def_cough() {
    const m = this.mochi;
    let seed = null;
    return {
      name: '咳一咳（可选）', lines: ['cough_1', 'cough_3'], hintAt: [6, 14], autoAt: 24, confirm: true,
      enter: () => {
        m.setPose('stand'); m.calm(); this.fx.zzz.set(false); m.forcePose = 'dizzy'; m.extra.shiver = 0.3;
        seed = this._prop(quad(this.tex.seed));
      },
      update: (dt, t) => {
        if (!seed || !seed.parent) return;
        const p = m.mouthWorld().add(new THREE.Vector3(0.02, Math.sin(t * 6) * 0.01, 0.03));
        seed.position.copy(p); seed.scale.set(0.07, 0.07, 1); faceHead(seed, this.head, Math.sin(t * 5) * 0.4);
        seed.renderOrder = depthOrder(p.z, 0.97);
      },
      finish: (byChild) => {
        m.forcePose = null; m.extra.shiver = 0;
        m.sneeze(() => {
          const from = seed?.position.clone() || m.mouthWorld();
          seed?.parent?.remove(seed);
          this.movers.push(new Mover(this.world, this.tex.seed, { from, to: from.clone().add(new THREE.Vector3(0.9, 0.9, -0.4)), dur: 1.6, size: [0.07, 0.05], fade: [0, 0.3], arc: 0.2, head: this.head, spin: 2 }));
          if (byChild) this._after(0.5, () => this._say('cough_ok'));
          this._after(0.6, () => m.happy());
        });
        return 2.8;
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
