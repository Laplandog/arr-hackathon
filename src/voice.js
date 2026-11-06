// 旁白（讲故事的人）：台词在 public/config/voice.json，团队改台词不用动代码。
// 每句先找录好的音频 assets/audio/vo_{id}.mp3；没有就用浏览器的语音合成（中文声音）念；再没有就只在家长面板上显示字幕。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { assetUrl } from './assets.js';

export class Voice {
  constructor(audio, data) {
    this.audio = audio;
    this.lines = data?.lines || {};
    this.buffers = {};
    this.current = null; this.subtitle = ''; this.subtitleT = 0;
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.zhVoice = null;
    if (this.tts) {
      const pick = () => {
        const vs = this.tts.getVoices();
        this.zhVoice = vs.find((v) => /^zh(-|_)?(CN|Hans)/i.test(v.lang) && /xiaoxiao|huihui|female|女/i.test(v.name))
          || vs.find((v) => /^zh(-|_)?(CN|Hans)/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
      };
      pick();
      this.tts.addEventListener?.('voiceschanged', pick);
    }
  }
  async loadAll() {
    const loader = new THREE.AudioLoader();
    const ids = Object.keys(this.lines).filter((k) => !k.startsWith('_'));
    let n = 0;
    await Promise.all(ids.map(async (id) => {
      const file = this.lines[id].file || `vo_${id}`;
      try { this.buffers[id] = await loader.loadAsync(assetUrl(`${CONFIG.paths.audio}${file}${CONFIG.audio.ext}`)); n++; } catch { /* 用语音合成 */ }
    }));
    console.log(`[voice] 台词 ${ids.length} 句，录好的音频 ${n} 句，其余${this.tts ? '用语音合成' : '只显示字幕'}`);
  }
  text(id) { return this.lines[id]?.text || ''; }
  has(id) { return !!this.lines[id]; }
  /** 念一句；同时只念一句（新的一句会打断旧的） */
  say(id) {
    const L = this.lines[id];
    if (!L) { console.warn(`[voice] 没有这句台词：${id}`); return; }
    this.stop();
    this.subtitle = L.text; this.subtitleT = 0;
    console.log(`%c[旁白] ${L.text}`, 'color:#c06a2b');
    const buf = this.buffers[id];
    if (buf && this.audio.unlocked) {
      const a = new THREE.Audio(this.audio.listener);
      a.setBuffer(buf); a.gain.gain.value = CONFIG.voice.volume; a.play();
      this.current = a;
      return;
    }
    if (this.tts) {
      const u = new SpeechSynthesisUtterance(L.text);
      u.lang = 'zh-CN'; u.rate = CONFIG.voice.ttsRate; u.pitch = CONFIG.voice.ttsPitch; u.volume = CONFIG.voice.volume;
      if (this.zhVoice) u.voice = this.zhVoice;
      this.tts.speak(u);
    }
  }
  stop() {
    try { this.current?.stop(); } catch { /* 已停 */ }
    this.current = null;
    this.tts?.cancel();
  }
  update(dt) { this.subtitleT += dt; }
}
