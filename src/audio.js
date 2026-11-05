// 音频：THREE.AudioListener（挂在相机）+ THREE.Audio（非空间化）。缺失的文件静默跳过，只在控制台警告。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { assetUrl, report } from './assets.js';

const A = CONFIG.audio;

export class AudioMgr {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.tags = new Map();   // tag → Set<THREE.Audio>
    this.loops = {};         // name → THREE.Audio
    this.bgm = null; this.wantBgm = false; this.bgmVol = A.bgmVolume;
    this.synthCache = new Map();
  }
  get unlocked() { return this.ctx.state === 'running'; }

  async loadAll() {
    const loader = new THREE.AudioLoader();
    await Promise.all(A.names.map(async (n) => {
      const path = `${CONFIG.paths.audio}${n}${A.ext}`;
      try { this.buffers[n] = await loader.loadAsync(assetUrl(path)); } catch { report.audioMissing.push(path); }
    }));
    if (report.audioMissing.length) console.warn(`[audio] ${report.audioMissing.length} 个音频缺失，静默跳过${A.synthFallback ? '（用合成占位音）' : ''}`);
  }

  /** 在点击“进入 VR”或桌面首次点击/按键时调用 */
  unlock() {
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => { console.log('[audio] AudioContext 已解锁'); if (this.wantBgm) this._startBgm(); }).catch(() => {});
    } else if (this.wantBgm && !this.bgm) this._startBgm();
  }

  _buf(name, dur) {
    if (this.buffers[name]) return this.buffers[name];
    if (!A.synthFallback) return null;
    const key = `${name}|${dur ?? ''}`;
    if (!this.synthCache.has(key)) this.synthCache.set(key, synth(this.ctx, name, dur));
    return this.synthCache.get(key);
  }

  /**
   * 播放一次音效。dur：模板里的秒数 —— 文件比它长就在结束前 0.2 秒淡出；更短不处理。
   * tag：暂停时可以按 tag 停掉（例如 'step' = 当前这口呼吸的音效）。
   */
  play(name, { vol = A.sfxVolume, dur = null, tag = null } = {}) {
    const buf = this._buf(name, dur);
    if (!buf || !this.unlocked) return null;
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf);
    a.gain.gain.value = vol;
    a.onEnded = () => {
      THREE.Audio.prototype.onEnded.call(a);
      try { a.disconnect(); a.gain.disconnect(); } catch { /* 已断开 */ }
      if (tag) this.tags.get(tag)?.delete(a);
    };
    a.play();
    if (dur != null && buf.duration > dur && a.source) {
      const g = a.gain.gain, t0 = this.ctx.currentTime, f = A.stepFadeOutSec;
      g.setValueAtTime(vol, t0 + Math.max(0, dur - f));
      g.linearRampToValueAtTime(0.0001, t0 + dur);
      a.source.stop(t0 + dur + 0.05);
    }
    if (tag) { if (!this.tags.has(tag)) this.tags.set(tag, new Set()); this.tags.get(tag).add(a); }
    return a;
  }

  stopTag(tag, fade = 0.15) {
    const set = this.tags.get(tag);
    if (!set) return;
    const t0 = this.ctx.currentTime;
    for (const a of set) {
      try {
        a.gain.gain.cancelScheduledValues(t0);
        a.gain.gain.setValueAtTime(a.gain.gain.value, t0);
        a.gain.gain.linearRampToValueAtTime(0.0001, t0 + fade);
        a.source?.stop(t0 + fade + 0.02);
      } catch { /* 已停止 */ }
    }
    set.clear();
  }

  /** 循环音（打呼噜） */
  loop(name, on, vol = A.sfxVolume * 0.7) {
    const cur = this.loops[name];
    if (on) {
      if (cur || !this.unlocked) { if (!this.unlocked) this._pendingLoops = { ...(this._pendingLoops || {}), [name]: vol }; return; }
      const buf = this._buf(name, null);
      if (!buf) return;
      const a = new THREE.Audio(this.listener);
      a.setBuffer(buf); a.setLoop(true); a.gain.gain.value = 0.0001; a.play();
      a.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
      this.loops[name] = a;
    } else {
      if (this._pendingLoops) delete this._pendingLoops[name];
      if (!cur) return;
      const t0 = this.ctx.currentTime;
      cur.gain.gain.setTargetAtTime(0.0001, t0, 0.15);
      try { cur.source?.stop(t0 + 0.8); } catch { /* */ }
      delete this.loops[name];
    }
  }

  startBgm() { this.wantBgm = true; if (this.unlocked) this._startBgm(); }
  _startBgm() {
    if (this._pendingLoops) { const p = this._pendingLoops; this._pendingLoops = null; for (const [n, v] of Object.entries(p)) this.loop(n, true, v); }
    if (this.bgm) return;
    const buf = this._buf(A.bgm, null);
    if (!buf) return;
    this.bgm = new THREE.Audio(this.listener);
    this.bgm.setBuffer(buf); this.bgm.setLoop(true);
    this.bgm.gain.gain.value = 0.0001;
    this.bgm.play();
    this.bgm.gain.gain.setTargetAtTime(this.bgmVol, this.ctx.currentTime, 0.6);
  }
  bgmTo(v, sec = 2) {
    this.bgmVol = v;
    if (this.bgm) this.bgm.gain.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.05, sec / 3));
  }
  setMaster(v, sec = 0.4) { this.listener.gain.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.02, sec / 3)); }
  stopAllSfx() {
    for (const t of this.tags.keys()) this.stopTag(t);
    for (const n of Object.keys(this.loops)) this.loop(n, false);
    this._pendingLoops = null;
  }
}

// ───────────── 合成占位音（CONFIG.audio.synthFallback = true 时才用） ─────────────
function synth(ctx, name, dur) {
  const sr = ctx.sampleRate;
  const mk = (sec, fn) => {
    const n = Math.max(1, Math.floor(sec * sr));
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const v = fn(t, sec, (x) => (lp += (x - lp) * 0.08)); d[i] = Math.max(-1, Math.min(1, v)); }
    return b;
  };
  const S = Math.sin, P2 = Math.PI * 2;
  const env = (t, sec, a = 0.15, r = 0.3) => Math.min(1, t / a) * Math.min(1, (sec - t) / r);
  const glide = (f0, f1) => (t, sec) => { const k = t / sec; const ph = P2 * (f0 * t + (f1 - f0) * t * k / 2); return 0.25 * env(t, sec, 0.3, 0.4) * (S(ph) + 0.3 * S(2 * ph)); };
  switch (name) {
    case 'bgm_pad_loop': return mk(8, (t) => 0.06 * (1 + 0.3 * S(P2 * t / 8)) * (S(P2 * 131 * t) + S(P2 * 196 * t) + 0.8 * S(P2 * 247 * t) + 0.6 * S(P2 * 330 * t)));
    case 'sfx_inhale_rise': return mk(dur || 3, glide(330, 523));
    case 'sfx_exhale_fall': return mk(dur || 3, glide(523, 330));
    case 'sfx_hold': return mk(dur || 2, (t, sec) => 0.08 * env(t, sec, 0.2, 0.4) * (S(P2 * 523 * t) + S(P2 * 659 * t) + S(P2 * 784 * t)) * (1 + 0.2 * S(P2 * 5 * t)));
    case 'sfx_huff': return mk(0.6, (t, sec, lp) => 0.5 * lp(Math.random() * 2 - 1) * env(t, sec, 0.04, 0.4) * 2);
    case 'sfx_sneeze': return mk(0.5, (t, sec, lp) => 0.6 * lp(Math.random() * 2 - 1) * env(t, sec, 0.02, 0.3) * 2 + 0.1 * S(P2 * (600 - 400 * t) * t) * env(t, sec, 0.02, 0.2));
    case 'sfx_melt_chime': return mk(1.4, (t) => Math.exp(-t * 3) * 0.2 * (S(P2 * 1047 * t) + 0.6 * S(P2 * 1568 * t) + 0.4 * S(P2 * 2093 * t)));
    case 'sfx_star': return mk(0.6, (t) => [0, 0.08, 0.16].reduce((s, o, i) => s + (t > o ? Math.exp(-(t - o) * 8) * 0.18 * S(P2 * [1319, 1760, 2349][i] * (t - o)) : 0), 0));
    case 'sfx_snore': return mk(4, (t, sec, lp) => 0.5 * lp(Math.random() * 2 - 1) * Math.pow(Math.max(0, S(P2 * t / 4)), 2) * 1.5);
    case 'sfx_round_complete': return mk(1.8, (t) => [0, 0.18, 0.36, 0.54].reduce((s, o, i) => s + (t > o ? Math.exp(-(t - o) * 2.5) * 0.16 * S(P2 * [523, 659, 784, 1047][i] * (t - o)) : 0), 0));
    case 'sfx_pat_drum': return mk(0.35, (t) => Math.exp(-t * 14) * 0.6 * S(P2 * (110 - 40 * t) * t));
    case 'sfx_egg_warm': return mk(1.6, (t, sec) => 0.12 * env(t, sec, 0.2, 0.8) * (S(P2 * 392 * t) + S(P2 * 494 * t) + 0.7 * S(P2 * 587 * t)));
    case 'sfx_constellation': return mk(1.6, (t) => [0, 0.12, 0.24, 0.36, 0.48].reduce((s, o, i) => s + (t > o ? Math.exp(-(t - o) * 3) * 0.13 * S(P2 * [784, 988, 1175, 1568, 1976][i] * (t - o)) : 0), 0));
    case 'sfx_hatch': return mk(1.2, (t, sec, lp) => 0.35 * lp(Math.random() * 2 - 1) * Math.exp(-t * 18) + Math.exp(-t * 2.5) * 0.15 * (S(P2 * 1047 * t) + S(P2 * 1319 * t) + S(P2 * 1568 * t)));
    default: return null;
  }
}
