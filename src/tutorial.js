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
  /** 发抖的符号：三道竖着排的波浪线 ~（像漫画里冷得打哆嗦） */
  shake: () => canvasTexture(96, 128, (g, w, h) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const rows = [[h * 0.24, 0.8], [h * 0.5, 1.0], [h * 0.76, 0.8]]; // 中间那道长一点
    for (const [col, lw] of [['rgba(255,255,255,0.95)', 10], ['rgba(110,160,225,1)', 5]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      for (const [y, len] of rows) {
        const x0 = w * (0.5 - 0.38 * len), x1 = w * (0.5 + 0.38 * len);
        g.beginPath();
        for (let x = x0; x <= x1 + 0.1; x += 2) g.lineTo(x, y + Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2.5) * 7);
        g.stroke();
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
    if (s.level < s.def.lines.length) { this._hintLine(s, s.level); s.level++; s.t = Math.max(s.t, this._hintAt(s, s.level - 1)); } else this._complete(false, '家长提示到底');
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
    this.audio.play('sfx_huff', { dur: CONFIG.audio.huffSoundSec }); // 孩子的“哈——”
    this.movers.push(new Mover(this.world, this.tex.puff, {
      color: 0xfff1dc, from, via, to, dur, size: [0.05, 0.16], fade: [0.15, 0.2], arc: 0.06, opacity: 0.95, head: this.head, spin: 1.2,
    }));
  }

  // ───── 内部 ─────
  get cur() { return this.state; }
  _say(id) { if (this.voice.has(id)) this.voice.say(id); }
  /** 念第 k 句提示；这一段可以在念之前 / 之后配动作（def.onHint） */
  _hintLine(s, k) {
    const id = s.def.lines[k], say = () => this._say(id);
    if (s.def.onHint) s.def.onHint(k, say); else say();
  }
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
    this.fx.egg.shiver = 0;
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
    // 不打断上一段的最后一句（例如“Mochi is so good at copying you!”）：_next 已经等它说完了
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
      if (s.level < d.lines.length && s.t >= this._hintAt(s, s.level)) { this._hintLine(s, s.level); s.level++; }
      if (s.t >= (d.autoAt ?? CONFIG.tutorial.autoAt)) this._complete(false, '世界自己完成');
    } else if ((s.outT -= dt) <= 0 && !this.voice.speaking) { // 等旁白把这句说完再进下一段
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

  /**
   * 你动我也动：孩子做完一个动作（歪头 / 转头 / 抬头低头），Mochi 跟着清清楚楚地学一遍。
   * “你做完 → 它再做”像轮流模仿，比同时跟着动更容易看出“它在学我”。学满 3 次就算发现了。
   */
  _def_mirror() {
    const m = this.mochi, h = this.head, T = CONFIG.tutorial;
    let base = null, armed = true, pending = null, held = 0, echoes = 0, busy = 0;
    const echo = (g) => {
      echoes++; busy = T.echoSec + 0.3;
      const side = Math.sign(g.v) || 1;
      if (g.kind === 'roll') {         // 歪头：往孩子看到的同一边歪（像照镜子）
        m.extra.lean = side * T.echoTiltDeg;
      } else if (g.kind === 'yaw') {   // 转头：转向同一边、身子也偏过去一点
        m.faceToward(_w.set(m.x.v - side, 0, 0)); m.extra.lean = side * T.echoTiltDeg * 0.5; m.extra.x = -side * 0.08;
      } else if (side > 0) {           // 抬头：伸长脖子往上看
        m.extra.y = 0.06; m.lookUp(T.echoSec * 0.6);
      } else {                         // 低头 / 点头：往下一沉
        m.extra.y = -0.05;
      }
      m.hop(CONFIG.mochi.hop.height * 0.3, 0.3);
      this._after(T.echoSec, () => { Object.assign(m.extra, { lean: 0, x: 0, y: 0 }); m.faceToward(null); });
      if (echoes >= 3) this._after(T.echoSec + 0.2, () => this._complete(true, `Mochi 学了孩子 ${echoes} 下`));
    };
    // 演示时每句提示都会播到，动作要和台词对上：
    //   第 1 句“Hmm? Mochi seems to be copying you.”之前，Mochi 先左右摇摆（像在学孩子摇头）
    //   第 3 句“Give a little nod…”说完，Mochi 点两下头 → 接“Mochi is so good at copying you!”
    const sway = (sec) => {
      busy = sec + 0.3;
      this.seqs.push(new Seq([{ dur: sec, update: (p) => { const s = Math.sin(p * Math.PI * 4) * Math.sin(p * Math.PI); m.extra.lean = s * 15; m.extra.x = -s * 0.04; }, end: () => { m.extra.lean = 0; m.extra.x = 0; } }]));
    };
    const nod = (times, sec) => {
      busy = sec + 0.3;
      this.seqs.push(new Seq([{ dur: sec, update: (p) => { m.extra.y = -Math.abs(Math.sin(p * Math.PI * times)) * 0.055; }, end: () => { m.extra.y = 0; } }]));
    };
    return {
      name: '你动我也动', lines: ['mirror_1', 'mirror_2', 'mirror_3'], hintAt: [10, 18, 26], autoAt: 40, confirm: true,
      onHint: (k, say) => {
        if (k === 0) { sway(T.swaySec); this._after(T.swaySec + 0.1, say); }
        else if (k === 2) {
          say();
          this._after(this.voice.duration('mirror_3') + 0.2, () => {
            if (this.state.success) return;
            nod(2, T.nodSec);
            this._after(T.nodSec + 0.2, () => this._complete(true, 'Mochi 学孩子点头'));
          });
        } else say();
      },
      enter: () => { m.setPose('stand'); m.setWaitMode(true); m.calm(); base = { yaw: h.yaw, pitch: h.pitch }; },
      update: (dt) => {
        if (this.state.success) return;
        busy -= dt;
        let yaw = h.yaw - base.yaw; if (yaw > 180) yaw -= 360; if (yaw < -180) yaw += 360;
        const yawR = clamp(yaw, -40, 40), pitchR = clamp(h.pitch - base.pitch, -30, 30), roll = clamp(h.roll, -30, 30);
        const cand = [{ kind: 'roll', v: roll, n: Math.abs(roll) / 12 }, { kind: 'yaw', v: yawR, n: Math.abs(yawR) / 18 }, { kind: 'pitch', v: pitchR, n: Math.abs(pitchR) / 12 }];
        const top = cand.reduce((a, b) => (b.n > a.n ? b : a));
        if (armed && top.n > 1) { armed = false; pending = top; held = 0; }
        if (pending) {
          if (top.kind === pending.kind && top.n > pending.n) pending = top; // 记下这一下最大的幅度
          held += dt;
          // 孩子回正了（或者保持了一会儿）→ Mochi 学一遍
          if ((top.n < 0.45 || held > 0.9) && busy <= 0) { echo(pending); pending = null; }
        }
        if (top.n < 0.45) armed = true;
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
        m.yawn(() => { m.setPose('sleep'); this.fx.zzz.set(true); this.audio.loop('sfx_snore', true); });
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
   * 吸-停-呼（不需要孩子/家长操作，整段自己演完；孩子在后面的正式练习里跟着做）：
   * 一群萤火虫从旁边飞过来 → 直接飞到 Mochi 身下把它托起来（吸）；
   * 停一下：一颗水滴从天上慢慢落到 Mochi 头上；呼气：萤火虫托着 Mochi 慢慢降落，水滴滑进窝里。
   */
  _def_inhale() {
    const m = this.mochi, T = CONFIG.tutorial, tp = this.template;
    let flies = [], home = null, spawn = null, mode = 'idle', mt = 0, drop = null;
    const under = (f, out) => out.set(m.root.position.x + f.ring.x, m.root.position.y - m.S * 0.5 + f.ring.y, m.root.position.z + f.ring.z);
    return {
      // 等开场这句（录音约 7 秒）说完、萤火虫也到齐了，再托起 Mochi
      name: '吸一吸（萤火虫托起 Mochi）', lines: [], autoAt: Math.max(T.swarmArriveSec, 0.3 + this.voice.duration('inhale_1') + 0.4), confirm: false,
      enter: () => {
        m.wake(); this.fx.zzz.set(false); this.audio.loop('sfx_snore', false); m.faceToward(null); m.setWaitMode(true);
        this.audio.bgmPlay('fly'); // 萤火虫托起 Mochi：换成飞行的曲子
        this._after(0.3, () => this._say('inhale_1'));
        this._after(0.6, () => m.lookUp(1.2));
        home = this.head.local(T.swarmDist, T.swarmDown);
        spawn = home.clone().add(new THREE.Vector3(-1.3, 0.6, -1.0));
        const [sx, sy, sz] = T.swarmSpread;
        flies = Array.from({ length: T.swarmCount }, (_, i) => {
          const f = new Firefly(this, this.tex.glow);
          f.off = new THREE.Vector3(rand(-sx, sx), rand(-sy, sy), rand(-sz, sz));
          f.ph = rand(0, TAU); f.alpha = 0; f.delay = i * 0.12;
          const a = (i / T.swarmCount) * TAU;
          f.ring = new THREE.Vector3(Math.cos(a) * 0.24, rand(-0.02, 0.1), Math.sin(a) * 0.12 + 0.05);
          f.from = new THREE.Vector3(); f.mid = new THREE.Vector3();
          return f;
        });
      },
      update: (dt, t) => {
        mt += dt;
        flies.forEach((f, i) => {
          const wob = _w.set(Math.sin(t * 1.7 + f.ph) * 0.05, Math.sin(t * 2.3 + f.ph * 1.3) * 0.035, Math.sin(t * 1.1 + f.ph) * 0.03);
          if (mode === 'idle') { // 一只接一只从旁边飞过来，聚在孩子面前
            const p = ease.outCubic(clamp((mt - f.delay) / 1.8, 0, 1));
            f.alpha = p; f.size = 1.4;
            f.pos.copy(spawn).add(_v.copy(f.off).multiplyScalar(3)).lerp(_v.copy(home).add(f.off), p).add(wob);
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
        // 水滴：慢慢落下来，碰到 Mochi 头顶就溅开、消失
        if (drop?.on) {
          const touch = m.headTopWorld().add(_v.set(0, 0.07, 0.02)); // 水滴下沿碰到头顶时，水滴中心的位置
          const p = Math.min(1, drop.t / drop.dur); drop.t += dt;
          drop.mesh.position.lerpVectors(drop.from, touch, ease.inOutSine(p));
          drop.mesh.position.x += Math.sin(p * Math.PI * 3) * 0.04 * (1 - p);
          drop.mesh.scale.set(0.1, 0.15, 1);
          faceHead(drop.mesh, this.head);
          drop.mesh.renderOrder = depthOrder(drop.mesh.position.z, 0.97);
          if (p >= 1) {
            drop.on = false; drop.mesh.parent?.remove(drop.mesh);
            this.audio.play('sfx_drop');
            this.fx.sparks.burst(m.headTopWorld(), 14, { speed: 0.3, up: 0.14, life: [0.35, 0.7], size: [0.012, 0.026], colors: ['#dff2ff', '#ffffff', '#a8d4ff'], spread: 0.03, grav: -0.3 });
          }
        }
      },
      finish: () => {
        // 这一段是演示（不用孩子操作），节奏跟着旁白走：每个阶段至少等这句录音说完（正式练习里才按模板的秒数）
        const B = this.getSettings().band, V = this.voice, lift = 0.5; // 萤火虫飞到 Mochi 身下的时间里，Mochi 稍后一点开始升
        const inhale = Math.max(tp.inhaleSec, lift + V.duration('inhale_ok') + 0.2);
        const hold = Math.max(tp.holdSec, V.duration('inhale_hold') + 0.2);
        const exhale = Math.max(tp.exhaleSec, V.duration('inhale_down') + 0.3);
        mode = 'carry'; mt = 0;
        for (const f of flies) {
          f.alpha = 1; f.from.copy(f.pos);
          under(f, f.mid); f.mid.lerp(f.from, 0.5); f.mid.y += 0.35;
        }
        this._after(lift, () => {
          // Mochi 被萤火虫托着飞起来（= 正式练习里的“吸气上升”）
          m.setWaitMode(false); m.setWings('flap'); m.flyY(B.center, inhale - lift, ease.inOutSine); m.setBelly(CONFIG.mochi.inhaleBelly, inhale - lift);
          this.audio.play('sfx_inhale_rise', { dur: inhale - lift });
          this._say('inhale_ok');
        });
        this._after(inhale, () => {
          m.setHover(true); m.setWings('hover'); m.setEyes('happy');
          const from = m.headTopWorld().add(new THREE.Vector3(0.05, T.dropFall, 0));
          drop = { on: true, falling: true, t: 0, dur: hold, from, mesh: this._prop(quad(this.tex.drop)) };
          this._say('inhale_hold');
        });
        this._after(inhale + hold, () => {
          m.setHover(false); m.setEyes('open'); m.setWings('glide'); m.flyY(this.getSettings().groundY, exhale, ease.inOutSine); m.setBelly(1, exhale);
          this.audio.play('sfx_exhale_fall', { dur: exhale });
          this._say('inhale_down');
        });
        this._after(inhale + hold + exhale, () => { m.setWings('fold'); mode = 'scatter'; });
        return inhale + hold + exhale + 1.4;
      },
    };
  }

  /** 哈气：Mochi 冻成冰蓝色、发抖、冒冷气 → 孩子哈气 → 热气飞进 Mochi 嘴里，颜色慢慢变回来、火苗变大 */
  _def_huff() {
    const m = this.mochi, T = CONFIG.tutorial;
    let smoke = 0, cold = null;
    return {
      name: '哈一哈', lines: ['huff_1', 'huff_2', 'huff_3'], autoAt: 38, confirm: true,
      enter: () => {
        m.setPose('stand'); m.faceToward(null); m.setWaitMode(false); m.calm(); this.fx.zzz.set(false);
        this.audio.bgmPlay('main'); // 世界醒过来了：换成绘本摇篮曲（一直用到正式练习）
        m.cold.go(1, 1.2); m.extra.shiver = 1;
        m.forcePose = 'cold'; // 美术交了 mochi_pose_cold（冷得缩成一团的表情）就用它，没有就用平常的站姿
        cold = new ColdFX(this, (o) => o.copy(m.root.position), m.S); cold.on();
      },
      update: (dt, t) => {
        cold.update(dt, t);
        // 嘴里时不时冒出一小缕冷气（小火苗快熄了）
        if (!this.state.success && (smoke -= dt) <= 0) {
          smoke = 2.6;
          const from = m.mouthWorld();
          this.movers.push(new Mover(this.world, this.tex.puff, { color: 0xcfe2f7, from, to: from.clone().add(new THREE.Vector3(0.05, 0.22, 0.02)), dur: 1.4, size: [0.03, 0.09], fade: [0.2, 0.5], opacity: 0.85, head: this.head }));
        }
      },
      finish: (byChild) => {
        const warm = () => {
          m.cold.go(0, 2.4, ease.inOutSine); m.extra.shiver = 0; m.forcePose = null;
          cold.warm();
          this.audio.play('sfx_revive'); // Mochi 暖回来
          m.huff(() => this.fx.flames.shoot(m.mouthWorld(), m.mouthWorld().add(new THREE.Vector3(0.32, 0.24, 0.12)), { demo: true }));
          this._after(0.9, () => m.happy({ spin: true }));
        };
        if (byChild) {
          // 顺序：孩子的“哈——”（哈气声完整放完）→ 热气飞进 Mochi 嘴里、变暖 → “Mochi is warm now! Thank you!”
          this.voice.stop(); // 孩子已经做到了，提示句不用再说完，让哈气声听得清楚
          this.childBreath(m.mouthWorld(), T.breathSec);
          this._after(T.breathSec, warm);
          this._after(Math.max(T.breathSec + 1.1, CONFIG.audio.huffSoundSec + 0.25), () => this._say('huff_ok'));
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
        // 顺序：咳嗽声“咳、咳”（完整放完）+ 种子弹出去 → “The seed flew away!”
        m.forcePose = null; m.extra.shiver = 0;
        if (byChild) this.voice.stop();
        m.sneeze(() => {
          this.audio.play('sfx_cough');
          const from = seed?.position.clone() || m.mouthWorld();
          seed?.parent?.remove(seed);
          this.movers.push(new Mover(this.world, this.tex.seed, { from, to: from.clone().add(new THREE.Vector3(0.9, 0.9, -0.4)), dur: 1.6, size: [0.07, 0.05], fade: [0, 0.3], arc: 0.2, head: this.head, spin: 2 }));
          if (byChild) this._after(this.audio.clipDur('sfx_cough') + 0.25, () => this._say('cough_ok'));
          this._after(0.6, () => m.happy());
        });
        return 3.0;
      },
    };
  }

  /**
   * 收尾“暖暖龙蛋”：龙蛋冻得发抖（发抖符号 + 小雪花），Mochi 看看蛋、再看看孩子。
   * 孩子哈气（家长确认）→ 热气飞到蛋上 → 蛋从冰凉变成“微暖发光”（颜色变暖、亮一下、一道光）→ 进入正式练习。
   */
  _def_egg() {
    const m = this.mochi, e = this.fx.egg, T = CONFIG.tutorial;
    let cold = null;
    return {
      name: '暖暖龙蛋', lines: ['egg_1', 'egg_2', 'egg_3'], hintAt: [2.2, 10, 18], autoAt: 30, confirm: true,
      enter: () => {
        m.setPose('stand'); m.calm(); this.fx.zzz.set(false); m.faceToward(e.center());
        cold = new ColdFX(this, (o) => e.center(o), e.h, { flakes: 4 });
        if (!e.hatched && e.stage === 0) { cold.on(); e.shiver = 1; }
        this._after(1.6, () => m.faceToward(null)); // 看看蛋，再看看孩子
      },
      update: (dt, t) => cold.update(dt, t),
      finish: (byChild) => {
        const warm = () => {
          cold.warm(); e.shiver = 0;
          e.target = Math.max(e.target, 1); e.setStage(1); // 冰凉 → 微暖发光：颜色变暖、亮一下、一道光
          m.happy({ spin: true });
        };
        if (byChild) {
          // 顺序：孩子的“哈——”（哈气声完整放完）→ 热气飞到蛋上、蛋变暖 → “The egg is a little warmer!” → “Let's keep warming it up together!”
          this.voice.stop();
          this.childBreath(e.center(), T.breathSec);
          this._after(T.breathSec, warm);
          this._after(Math.max(T.breathSec + 1.0, CONFIG.audio.huffSoundSec + 0.25), () => { this._say('egg_ok'); this.voice.queue('egg_go'); });
          return T.breathSec + 5.4;
        }
        // 孩子一直没做：Mochi 自己凑过去给蛋哈口热气（世界自己完成，不夸）
        m.faceToward(e.center());
        this._after(0.4, () => m.huff(() => {
          this.audio.play('sfx_huff', { vol: CONFIG.audio.sfxVolume * 0.6, dur: CONFIG.audio.huffSoundSec });
          this.movers.push(new Mover(this.world, this.tex.puff, { color: 0xfff1dc, from: m.mouthWorld(), to: e.center(), dur: 0.6, size: [0.04, 0.12], fade: [0.15, 0.2], head: this.head }));
        }));
        this._after(1.3, warm);
        this._after(1.6, () => m.faceToward(null));
        this._after(3.0, () => this._say('egg_go'));
        return 5.4;
      },
    };
  }
}

const _c = new THREE.Vector3();
/** 冷的表现（Mochi、龙蛋共用）：两边各三道发抖的弯线（左右交替闪）+ 身边飘小雪花；变暖时身上一圈暖光 */
class ColdFX {
  constructor(tut, center, size, { flakes = 5 } = {}) {
    this.tut = tut; this.center = center; this.size = size;
    this.vis = new Tween(0);
    this.marks = [tut._prop(quad(tut.tex.shake)), tut._prop(quad(tut.tex.shake))];
    this.flakes = Array.from({ length: flakes }, (_, i) => ({ mesh: tut._prop(quad(tut.tex.snow)), t: (i / flakes) * 2.6, x: rand(-0.5, 0.5), ph: rand(0, TAU) }));
    this.glow = tut._prop(quad(tut.tex.glow, { additive: true, color: 0xffa860 }));
    this.glow.visible = false; this.glowT = -1;
  }
  on(sec = 1.2) { this.vis.go(1, sec); }
  warm() { this.vis.go(0, 0.8); this.glowT = 0; this.glow.visible = true; }
  update(dt, t) {
    const head = this.tut.head, cv = this.vis.update(dt), S = this.size, c = this.center(_c);
    this.marks.forEach((mk, i) => {
      const side = i === 0 ? -1 : 1, on = 0.55 + 0.45 * Math.sign(Math.sin(t * TAU * 3 + i * Math.PI));
      mk.position.set(c.x + side * S * 0.5 + Math.sin(t * 50 + i) * 0.006, c.y + S * 0.05, c.z + 0.06);
      mk.scale.set(side * S * 0.26, S * 0.35, 1);
      faceHead(mk, head);
      mk.material.opacity = cv * on;
      mk.visible = cv > 0.01;
      mk.renderOrder = depthOrder(c.z + 0.06, 0.9);
    });
    for (const f of this.flakes) {
      f.t = (f.t + dt) % 2.6;
      const p = f.t / 2.6;
      f.mesh.position.set(c.x + f.x * S + Math.sin(t * 1.5 + f.ph) * 0.05, c.y + S * (0.7 - p * 1.0), c.z + 0.08);
      const s = 0.045 * (0.7 + 0.3 * Math.sin(f.ph));
      f.mesh.scale.set(s, s, 1);
      faceHead(f.mesh, head, t * 0.8 + f.ph);
      f.mesh.material.opacity = cv * Math.min(1, p / 0.15, (1 - p) / 0.2);
      f.mesh.visible = cv > 0.01;
      f.mesh.renderOrder = depthOrder(c.z + 0.08, 0.92);
    }
    if (this.glowT >= 0) {
      this.glowT += dt;
      const p = Math.min(1, this.glowT / 1.8), s = S * (0.9 + 0.5 * p);
      this.glow.position.set(c.x, c.y + S * 0.05, c.z + 0.04);
      this.glow.scale.set(s, s, 1);
      this.glow.material.opacity = 0.85 * Math.sin(Math.PI * p);
      faceHead(this.glow, head);
      this.glow.renderOrder = depthOrder(c.z + 0.04, 0.85);
      if (p >= 1) { this.glowT = -1; this.glow.visible = false; }
    }
  }
}
