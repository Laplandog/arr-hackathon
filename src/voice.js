// 旁白（讲故事的人，英文）：台词在 public/config/voice.json，团队改台词不用动代码。
// 每句播录好的音频 assets/audio/vo_en_{键}.m4a（或 .mp3）；万一缺了就用浏览器的英文语音合成念，再没有就只在家长面板上显示字幕。
// 录音会自动剪掉前后的空白、按响度拉到差不多大（不破音）；旁白说话时背景音乐自动压低一点。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { assetUrl } from './assets.js';
import { measureClip } from './audio.js';

export class Voice {
  constructor(audio, data) {
    this.audio = audio;
    this.lines = data?.lines || {};
    this.clips = {};
    this.current = null; this.subtitle = ''; this.subtitleT = 0; this.duckUntil = 0;
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.ttsVoice = null;
    if (this.tts) {
      const pick = () => {
        const vs = this.tts.getVoices();
        this.ttsVoice = vs.find((v) => /^en(-|_)(US|GB)/i.test(v.lang) && /aria|jenny|zira|samantha|female|google us/i.test(v.name))
          || vs.find((v) => /^en(-|_)US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
      };
      pick();
      this.tts.addEventListener?.('voiceschanged', pick);
    }
  }
  _files(id) {
    const L = this.lines[id];
    return L?.file ? [L.file] : [`vo_en_${id}.m4a`, `vo_en_${id}.mp3`];
  }
  async loadAll() {
    const V = CONFIG.voice, loader = new THREE.AudioLoader();
    const ids = Object.keys(this.lines).filter((k) => !k.startsWith('_'));
    await Promise.all(ids.map(async (id) => {
      for (const f of this._files(id)) {
        try {
          const buf = await loader.loadAsync(assetUrl(`${CONFIG.paths.audio}${f}`));
          // 门槛很低：轻轻的“Shh…”也不会被当成空白剪掉；前后各留一点
          this.clips[id] = { buf, ...measureClip(buf, { threshold: V.trimThreshold, preRoll: V.preRollSec, tail: V.tailSec, target: V.targetRms, maxGain: V.maxGain, maxPeak: V.maxPeak }) };
          return;
        } catch { /* 试下一个，最后用语音合成 */ }
      }
    }));
    const miss = ids.filter((id) => !this.clips[id]);
    console.log(`[voice] 台词 ${ids.length} 句，有录音 ${ids.length - miss.length} 句${miss.length ? `；没有录音（${this.tts ? '用语音合成' : '只显示字幕'}）：${miss.join(', ')}` : ''}`);
  }
  text(id) { return this.lines[id]?.text || ''; }
  has(id) { return !!this.lines[id]; }
  get recorded() { return Object.keys(this.clips).length; }
  /** 念一句；同时只念一句（新的一句会打断旧的） */
  say(id) {
    const L = this.lines[id];
    if (!L) { console.warn(`[voice] 没有这句台词：${id}`); return; }
    this.stop();
    this.subtitle = L.text; this.subtitleT = 0;
    console.log(`%c[旁白] ${L.text}`, 'color:#c06a2b');
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
      const u = new SpeechSynthesisUtterance(L.text);
      u.lang = 'en-US'; u.rate = V.ttsRate; u.pitch = V.ttsPitch; u.volume = V.volume;
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
