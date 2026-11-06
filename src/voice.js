// 旁白（讲故事的人）：台词在 public/config/voice.json（中文 text + 英文 en），团队改台词不用动代码。
// 语言：CONFIG.voice.lang（默认 'en'，网址加 ?lang=zh 用中文）。
// 每句先找录好的音频：英文 assets/audio/vo_en_{键}.m4a / .mp3，中文 vo_{键}.mp3 / .m4a；
// 没有录音就用浏览器的语音合成念；再没有就只在家长面板上显示字幕。
// 录音会自动剪掉前后的空白、按响度拉到差不多大（不破音）；旁白说话时背景音乐自动压低一点。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { assetUrl } from './assets.js';

/** 量一段录音：真正有声音的起止时间、响度 → 播放时的起点、时长、增益 */
function analyze(buf) {
  const V = CONFIG.voice;
  const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.02)), rms = [], peaks = [];
  for (let s = 0; s + win <= buf.length; s += win) {
    let a = 0, pk = 0;
    for (let i = s; i < s + win; i += 2) for (const c of ch) { const v = c[i]; a += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    rms.push(Math.sqrt(a / ((win / 2) * ch.length))); peaks.push(pk);
  }
  const max = Math.max(...rms, 1e-6);
  const th = max * V.trimThreshold;                 // 门槛很低：轻轻的“嘘……”也不会被当成空白剪掉
  let i0 = rms.findIndex((v) => v > th); if (i0 < 0) i0 = 0;
  let i1 = rms.length - 1; while (i1 > i0 && rms[i1] <= th) i1--;
  const wsec = win / buf.sampleRate;
  const start = Math.max(0, i0 * wsec - V.preRollSec);
  const end = Math.min(buf.duration, (i1 + 1) * wsec + V.tailSec);
  const speech = rms.slice(i0, i1 + 1).filter((v) => v > max * 0.08);
  const act = Math.sqrt(speech.reduce((s, v) => s + v * v, 0) / Math.max(1, speech.length)) || max;
  const peak = Math.max(...peaks.slice(i0, i1 + 1), 1e-6);
  const gain = Math.min(V.targetRms / act, V.maxPeak / peak, V.maxGain);
  return { start, dur: end - start, gain };
}

export class Voice {
  constructor(audio, data) {
    this.audio = audio;
    this.lines = data?.lines || {};
    const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('lang');
    this.lang = q === 'zh' || q === 'en' ? q : CONFIG.voice.lang;
    this.clips = {};
    this.current = null; this.subtitle = ''; this.subtitleAlt = ''; this.subtitleT = 0; this.duckUntil = 0;
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.ttsVoice = null;
    if (this.tts) {
      const pick = () => {
        const vs = this.tts.getVoices();
        if (this.lang === 'en') {
          this.ttsVoice = vs.find((v) => /^en(-|_)(US|GB)/i.test(v.lang) && /aria|jenny|zira|samantha|female|google us/i.test(v.name))
            || vs.find((v) => /^en(-|_)US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
        } else {
          this.ttsVoice = vs.find((v) => /^zh(-|_)?(CN|Hans)/i.test(v.lang) && /xiaoxiao|huihui|female|女/i.test(v.name))
            || vs.find((v) => /^zh(-|_)?(CN|Hans)/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
        }
      };
      pick();
      this.tts.addEventListener?.('voiceschanged', pick);
    }
  }
  _files(id) {
    const L = this.lines[id];
    if (L?.file) return [L.file];
    return this.lang === 'en' ? [`vo_en_${id}.m4a`, `vo_en_${id}.mp3`] : [`vo_${id}.mp3`, `vo_${id}.m4a`];
  }
  async loadAll() {
    const loader = new THREE.AudioLoader();
    const ids = Object.keys(this.lines).filter((k) => !k.startsWith('_'));
    await Promise.all(ids.map(async (id) => {
      for (const f of this._files(id)) {
        try {
          const buf = await loader.loadAsync(assetUrl(`${CONFIG.paths.audio}${f}`));
          this.clips[id] = { buf, ...analyze(buf) };
          return;
        } catch { /* 试下一个，最后用语音合成 */ }
      }
    }));
    const have = Object.keys(this.clips);
    const miss = ids.filter((id) => !this.clips[id]);
    console.log(`[voice] 语言 ${this.lang}：台词 ${ids.length} 句，有录音 ${have.length} 句${miss.length ? `；还没录（${this.tts ? '用语音合成' : '只显示字幕'}）：${miss.join(', ')}` : ''}`);
  }
  /** 当前语言的台词文字 */
  text(id) { const L = this.lines[id]; return (this.lang === 'en' ? L?.en : L?.text) || L?.text || ''; }
  has(id) { return !!this.lines[id]; }
  get recorded() { return Object.keys(this.clips).length; }
  /** 念一句；同时只念一句（新的一句会打断旧的） */
  say(id) {
    const L = this.lines[id];
    if (!L) { console.warn(`[voice] 没有这句台词：${id}`); return; }
    this.stop();
    const text = this.text(id);
    this.subtitle = text; this.subtitleAlt = this.lang === 'en' ? L.text : (L.en || ''); this.subtitleT = 0;
    console.log(`%c[旁白] ${text}${this.subtitleAlt ? `（${this.subtitleAlt}）` : ''}`, 'color:#c06a2b');
    const clip = this.clips[id], V = CONFIG.voice;
    if (clip && this.audio.unlocked) {
      const a = new THREE.Audio(this.audio.listener);
      a.setBuffer(clip.buf);
      a.offset = clip.start; a.duration = clip.dur;
      a.gain.gain.value = V.volume * clip.gain;
      a.play();
      this.current = a;
      this._duck(clip.dur);
      return;
    }
    if (this.tts) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang === 'en' ? 'en-US' : 'zh-CN'; u.rate = V.ttsRate; u.pitch = V.ttsPitch; u.volume = V.volume;
      if (this.ttsVoice) u.voice = this.ttsVoice;
      u.onstart = () => this._duck(60);
      u.onend = u.onerror = () => { this.duckUntil = 0; };
      this.tts.speak(u);
    }
  }
  /** 说话时背景音乐压低（说完自动恢复） */
  _duck(sec) {
    this.audio.bgm?.setDuck(CONFIG.voice.duck, 0.25);
    this.duckUntil = this.audio.ctx.currentTime + sec;
  }
  stop() {
    try { this.current?.stop(); } catch { /* 已停 */ }
    this.current = null;
    this.tts?.cancel();
    this.duckUntil = 0;
  }
  update(dt) {
    this.subtitleT += dt;
    const bgm = this.audio.bgm;
    if (bgm && bgm.duckK < 1 && this.audio.ctx.currentTime > this.duckUntil) bgm.setDuck(1, 0.8);
  }
}
