// 音频：THREE.AudioListener（挂在相机）+ THREE.Audio（非空间化）。缺失的文件静默跳过，只在控制台警告。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { assetUrl, report } from './assets.js';

const A = CONFIG.audio;

/**
 * 量一段音频：真正有声音的起止时间、响度 → 播放时的起点、时长、增益（拉到 target 响度，不破音）。
 * 旁白和音效共用：录音 / 下载的音效前后常有空白、音量也各不一样。
 */
export function measureClip(buf, { threshold = 0.03, preRoll = 0.05, tail = 0.15, target = 0.1, maxGain = 5, maxPeak = 0.9 } = {}) {
  const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.02)), rms = [], peaks = [];
  for (let s = 0; s + win <= buf.length; s += win) {
    let a = 0, pk = 0;
    for (let i = s; i < s + win; i += 2) for (const c of ch) { const v = c[i]; a += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    rms.push(Math.sqrt(a / ((win / 2) * ch.length))); peaks.push(pk);
  }
  const max = Math.max(...rms, 1e-6), th = max * threshold;
  let i0 = rms.findIndex((v) => v > th); if (i0 < 0) i0 = 0;
  let i1 = rms.length - 1; while (i1 > i0 && rms[i1] <= th) i1--;
  const wsec = win / buf.sampleRate;
  const start = Math.max(0, i0 * wsec - preRoll);
  const end = Math.min(buf.duration, (i1 + 1) * wsec + tail);
  const act = rms.slice(i0, i1 + 1).filter((v) => v > max * 0.08);
  const level = Math.sqrt(act.reduce((s, v) => s + v * v, 0) / Math.max(1, act.length)) || max;
  const peak = Math.max(...peaks.slice(i0, i1 + 1), 1e-6);
  return { start, dur: end - start, gain: Math.min(target / level, maxPeak / peak, maxGain) };
}

/**
 * 背景音乐：按阶段切换（交叉淡入淡出）；每首在尾巴淡出之前就交叉淡入接回开头（短曲子循环也不会断、不会有空白）；
 * 四首按实测响度自动拉平；被别的曲子打断后再回来，从刚才的位置接着放。
 */
class Bgm {
  constructor(mgr) { this.mgr = mgr; this.tracks = {}; this.cur = null; this.want = null; this.vol = A.bgmVolume; this.pos = {}; this.duckK = 1; }
  get level() { return this.vol * this.duckK; }
  /** 旁白说话时把音乐压低到 k 倍（1 = 恢复） */
  setDuck(k, sec = 0.4) { if (Math.abs(k - this.duckK) < 1e-3) return; this.duckK = k; if (this.cur) this._ramp(this.cur.g.gain, this.level * this.cur.t.gain, sec); }
  /** 量一下这首：开头安静的部分、结尾淡出的部分、整体响度 */
  add(key, buf) {
    const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
    const win = Math.floor(buf.sampleRate * 0.25), rms = [];
    for (let s = 0; s + win <= buf.length; s += win) {
      let acc = 0;
      for (let i = s; i < s + win; i += 4) for (const c of ch) acc += c[i] * c[i];
      rms.push(Math.sqrt(acc / (win / 4) / ch.length));
    }
    const med = [...rms].sort((a, b) => a - b)[Math.floor(rms.length / 2)] || 0.1;
    const wsec = win / buf.sampleRate;
    let i0 = rms.findIndex((v) => v > med * 0.5); if (i0 < 0) i0 = 0;
    let i1 = rms.length - 1; while (i1 > i0 && rms[i1] < med * 0.6) i1--;
    const loopStart = Math.min(i0 * wsec, 3), loopEnd = Math.min(buf.duration, (i1 + 1) * wsec);
    const xf = Math.max(0.5, Math.min(A.bgmLoopXfSec, (loopEnd - loopStart) * 0.2));
    const gain = Math.max(0.5, Math.min(1.6, A.bgmTargetRms / med));
    this.tracks[key] = { buf, loopStart, loopEnd, xf, gain };
    console.log(`[bgm] ${key}：${buf.duration.toFixed(1)} 秒，循环 ${loopStart.toFixed(1)}–${loopEnd.toFixed(1)} 秒，交叉淡入 ${xf.toFixed(1)} 秒，音量 ×${gain.toFixed(2)}`);
  }
  _now() { return this.mgr.ctx.currentTime; }
  _position(v) { return v.offset + (this._now() - v.t0); }
  _ramp(param, to, sec) {
    const now = this._now();
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now); else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(Math.max(0.0001, to), now + Math.max(0.02, sec));
  }
  _fadeOut(v, sec) {
    this.pos[v.key] = this._position(v);
    this._ramp(v.g.gain, 0.0001, sec);
    try { v.src.stop(this._now() + sec + 0.05); } catch { /* 已停 */ }
  }
  _start(key, offset, fade) {
    const ctx = this.mgr.ctx, t = this.tracks[key];
    const src = ctx.createBufferSource(); src.buffer = t.buf;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(this.mgr.listener.getInput());
    const now = this._now();
    src.start(now, offset);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, this.level * t.gain), now + fade);
    this.cur = { key, src, g, t, t0: now, offset };
  }
  /** 换成某一首（同一首就不动）；还没解锁声音时先记下来，解锁后再放 */
  play(key, fade = A.bgmFadeSec) {
    if (!this.tracks[key]) key = this.tracks.main ? 'main' : Object.keys(this.tracks)[0];
    if (!key) return;
    this.want = key;
    if (!this.mgr.unlocked) return;
    if (this.cur?.key === key) return;
    if (this.cur) this._fadeOut(this.cur, fade);
    const t = this.tracks[key];
    let off = this.pos[key] ?? 0;
    if (off > t.loopEnd - t.xf - 1) off = t.loopStart;
    this._start(key, off, fade);
  }
  setVolume(v, sec = 2) { this.vol = v; if (this.cur) this._ramp(this.cur.g.gain, this.level * this.cur.t.gain, sec); }
  stop(fade = 0.8) { if (this.cur) { this._fadeOut(this.cur, fade); this.cur = null; } this.pos = {}; }
  update() {
    if (!this.mgr.unlocked) return;
    if (!this.cur) { if (this.want && this.mgr.wantBgm) this.play(this.want); return; }
    const c = this.cur, t = c.t;
    if (this._position(c) >= t.loopEnd - t.xf) { // 快到尾巴了：交叉淡入接回开头
      this._fadeOut(c, t.xf);
      this._start(c.key, t.loopStart, t.xf);
    }
  }
}

export class AudioMgr {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.clips = {};         // 音效：剪掉前后空白的起点/时长 + 拉平响度的增益
    this.tags = new Map();   // tag → Set<THREE.Audio>
    this.loops = {};         // name → THREE.Audio
    this.wantBgm = false;
    this.bgm = new Bgm(this);
    this.synthCache = new Map();
  }
  get unlocked() { return this.ctx.state === 'running'; }

  async loadAll() {
    const loader = new THREE.AudioLoader();
    const load = async (n) => {
      const path = `${CONFIG.paths.audio}${n}${A.ext}`;
      try { return await loader.loadAsync(assetUrl(path)); } catch { report.audioMissing.push(path); return null; }
    };
    await Promise.all([
      ...A.names.map(async (n) => {
        const b = await load(n);
        if (!b) return;
        this.buffers[n] = b;
        const loop = n === 'sfx_snore';
        // 打呼噜要循环：不剪空白（保持原来的节奏）；其他音效剪掉前后空白。全部按响度拉平到同一个小音量
        this.clips[n] = loop ? { start: 0, dur: b.duration, gain: measureClip(b, { target: A.sfxTargetRms }).gain } : measureClip(b, { target: A.sfxTargetRms });
      }),
      ...Object.entries(A.bgmTracks).map(async ([key, n]) => { const b = await load(n); if (b) this.bgm.add(key, b); }),
    ]);
    if (report.audioMissing.length) console.warn(`[audio] ${report.audioMissing.length} 个音频缺失，静默跳过${A.synthFallback ? '（用合成占位音）' : ''}`);
  }

  /** 在点击“进入 VR”或桌面首次点击/按键时调用 */
  unlock() {
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => { console.log('[audio] AudioContext 已解锁'); if (this.wantBgm) this._startBgm(); }).catch(() => {});
    } else if (this.wantBgm && !this.bgm.cur) this._startBgm();
  }
  update() { this.bgm.update(); }
  /** 换背景音乐：'intro' | 'main' | 'fly' | 'end' */
  bgmPlay(key, fade) { this.bgm.play(key, fade); }

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
    name = A.alias?.[name] || name; // 例如融雾 / 龙蛋变暖 / 孵化都用“复生”
    const buf = this._buf(name, dur);
    if (!buf || !this.unlocked) return null;
    const clip = this.clips[name] || { start: 0, dur: buf.duration, gain: 1 };
    const a = new THREE.Audio(this.listener);
    a.setBuffer(buf);
    a.offset = clip.start; a.duration = clip.dur;
    const g0 = vol * (A.sfxLevel?.[name] ?? 1) * clip.gain;
    a.gain.gain.value = g0;
    a.onEnded = () => {
      THREE.Audio.prototype.onEnded.call(a);
      try { a.disconnect(); a.gain.disconnect(); } catch { /* 已断开 */ }
      if (tag) this.tags.get(tag)?.delete(a);
    };
    a.play();
    if (dur != null && clip.dur > dur && a.source) {
      const g = a.gain.gain, t0 = this.ctx.currentTime, f = A.stepFadeOutSec;
      g.setValueAtTime(g0, t0 + Math.max(0, dur - f));
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
      a.gain.gain.setTargetAtTime(vol * (A.sfxLevel?.[name] ?? 1) * (this.clips[name]?.gain ?? 1), this.ctx.currentTime, 0.3);
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
    if (!this.bgm.cur) this.bgm.play(this.bgm.want || 'intro');
  }
  bgmTo(v, sec = 2) { this.bgm.setVolume(v, sec); }
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
