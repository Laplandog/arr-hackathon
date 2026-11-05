import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;
export const rand = (a, b) => a + Math.random() * (b - a);

export const ease = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

/** 标量补间：v 从当前值缓动到目标值。 */
export class Tween {
  constructor(v = 0) { this.v = v; this.from = v; this.to = v; this.t = 0; this.d = 0; this.e = ease.linear; this.cb = null; }
  set(v) { this.v = this.from = this.to = v; this.d = 0; this.cb = null; return this; }
  go(to, d, e = ease.inOutSine, cb = null) {
    if (!(d > 0)) { this.set(to); cb?.(); return this; }
    this.from = this.v; this.to = to; this.t = 0; this.d = d; this.e = e; this.cb = cb; return this;
  }
  update(dt) {
    if (this.d > 0) {
      this.t += dt;
      const p = Math.min(1, this.t / this.d);
      this.v = lerp(this.from, this.to, this.e(p));
      if (p >= 1) { this.d = 0; const cb = this.cb; this.cb = null; cb?.(); }
    }
    return this.v;
  }
  get active() { return this.d > 0; }
}

/** 顺序动画：[{dur, start(), update(p, dt), end()}]，跑在自己的时钟上（不受暂停影响）。 */
export class Seq {
  constructor(steps, onDone = null) {
    this.steps = steps; this.i = -1; this.t = 0; this.done = false; this.onDone = onDone;
    this._next();
  }
  _next() {
    for (;;) {
      this.i++; this.t = 0;
      if (this.i >= this.steps.length) { this.done = true; const cb = this.onDone; this.onDone = null; cb?.(); return; }
      const s = this.steps[this.i];
      s.start?.();
      if (this.done) return; // start() 里被取消
      if (s.dur > 0) return;
      s.update?.(1, 0); s.end?.();
    }
  }
  update(dt) {
    if (this.done) return;
    const s = this.steps[this.i];
    this.t += dt;
    const p = Math.min(1, this.t / s.dur);
    s.update?.(p, dt);
    if (p >= 1 && !this.done) { s.end?.(); this._next(); }
  }
  cancel() { this.done = true; this.onDone = null; }
}

/** 延时回调（不受暂停影响）。 */
export class Scheduler {
  constructor() { this.items = []; }
  after(sec, fn) { this.items.push({ t: sec, fn }); }
  update(dt) {
    if (!this.items.length) return;
    const due = [];
    this.items = this.items.filter((it) => { it.t -= dt; if (it.t <= 0) { due.push(it.fn); return false; } return true; });
    due.forEach((fn) => fn());
  }
  clear() { this.items = []; }
}

export function vec3(a, fallback = [0, 0, 0]) {
  if (Array.isArray(a)) return new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
  if (a && typeof a === 'object') return new THREE.Vector3(+a.x || 0, +a.y || 0, +a.z || 0);
  return new THREE.Vector3(...fallback);
}

const _q = new THREE.Vector3();
/** 二次贝塞尔：p0 → p2，控制点 c */
export function bezier(p0, c, p2, t, out = _q) {
  const u = 1 - t;
  return out.set(
    u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * c.z + t * t * p2.z,
  );
}

/** 透明层排序：离孩子越远（-z 越大）越先画。所有透明物体都用同一个换算，保证前后关系一致。 */
export function depthOrder(z, bias = 0) {
  return (1000 + z) * 1000 + bias; // z 是负数：z=-14 → 986000，z=-1.6 → 998400
}

export function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
