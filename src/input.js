// 输入：Quest 手柄（扳机 select 事件 + 每帧轮询 A/B/X/Y）+ 键盘。所有动作 300 ms 防抖。
// 孩子不拿手柄；旁边扮演家长的人拿右手柄（左手柄可选）。
import { CONFIG } from './config.js';

const I = CONFIG.input;

export class Input {
  constructor(renderer, actions) {
    this.renderer = renderer;
    this.actions = actions;          // { next, pause, end, restart, reloadLayout, toggleHud, sneeze, percussion, autoplay, recenter }
    this.last = {};                  // action → 上次触发时间（防抖）
    this.prev = new Map();           // inputSource → 上一帧按钮状态
    this.holds = new Map();          // `${hand}:${idx}` → { t, fired }
    this.onAny = null;               // 任意输入（用来解锁音频）

    window.addEventListener('keydown', (e) => {
      this.onAny?.();
      if (e.repeat) return;
      const a = I.keys[e.code];
      if (!a) return;
      if (e.code === 'Space') e.preventDefault();
      if (a === 'reloadLayout' && renderer.xr.isPresenting) return; // 仅桌面
      this.fire(a, `键盘 ${e.code}`);
    });

    renderer.xr.addEventListener('sessionstart', () => {
      const session = renderer.xr.getSession();
      session.addEventListener('select', (e) => {
        const hand = e.inputSource?.handedness || 'none';
        if (I.logButtons) console.log(`[input] select 事件（${hand} 扳机）`);
        if (I.nextHands.includes(hand) || hand === 'none') this.fire('next', `${hand} 扳机`);
      });
      this.prev.clear(); this.holds.clear();
    });
  }

  fire(action, src = '') {
    const now = performance.now();
    if (now - (this.last[action] || 0) < I.debounceMs) return;
    this.last[action] = now;
    if (I.logButtons) console.log(`[input] ${action} ← ${src}`);
    this.onAny?.();
    this.actions[action]?.();
  }

  /** 每帧轮询手柄按钮（按下沿检测；X 长按 1 秒 = 重新开始） */
  poll(dt) {
    const session = this.renderer.xr.getSession?.();
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const hand = src.handedness;
      const prev = this.prev.get(src) || [];
      const now = gp.buttons.map((b) => b.pressed);
      now.forEach((p, idx) => {
        const was = !!prev[idx];
        if (p !== was && I.logButtons) console.log(`[input] ${hand} 手柄 按钮索引 ${idx} ${p ? '按下' : '松开'}`);
        const key = `${hand}:${idx}`;
        if (p && !was) this.holds.set(key, { t: 0, fired: false });
        if (!p) this.holds.delete(key);
        const h = this.holds.get(key);
        if (h) h.t += dt;
        if (hand === 'right') {
          if (p && !was && idx === I.right.pause) this.fire('pause', `右手 按钮${idx}`);
          if (p && !was && idx === I.right.end) this.fire('end', `右手 按钮${idx}`);
        } else if (hand === 'left') {
          if (p && !was && idx === I.left.sneeze) this.fire('sneeze', `左手 按钮${idx}`);
          if (p && !was && idx === I.left.recenter) this.fire('recenter', `左手 按钮${idx}`);
          if (h && !h.fired && idx === I.left.restart && h.t >= I.restartHoldSec) { h.fired = true; this.fire('restart', `左手 按钮${idx} 长按`); }
          if (h && !h.fired && idx === I.left.autoplay && h.t >= I.autoplayHoldSec) { h.fired = true; this.fire('autoplay', `左手 按钮${idx} 长按`); }
        }
      });
      this.prev.set(src, now);
    }
  }
}
