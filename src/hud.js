// 桌面调试面板（DOM，VR 内自然不显示）。按 H 隐藏（录屏用）。
import { report } from './assets.js';

const STATE_CN = { INTRO: '开场', TUTORIAL: '新手引导（孩子自己摸索）', SLEEP: '放松呼吸', FLY: '胸廓扩张', HUFF: '哈气', SETTLE: '回到放松', END: '结束' };

export class Hud {
  constructor() {
    const el = document.createElement('div');
    el.id = 'hud';
    el.style.cssText = [
      'position:fixed', 'left:12px', 'top:12px', 'z-index:10', 'min-width:250px', 'max-width:330px',
      'padding:10px 12px', 'border-radius:10px', 'background:rgba(28,24,44,.62)', 'color:#f4f1ff',
      'font:12.5px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif', 'pointer-events:none',
      'backdrop-filter:blur(4px)', 'box-shadow:0 2px 12px rgba(0,0,0,.2)', 'white-space:pre-line',
    ].join(';');
    document.body.appendChild(el);
    this.el = el; this.visible = true;
    this.frames = 0; this.acc = 0; this.fps = 0; this.refresh = 0;
  }
  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; }

  update(dt, sm, extra) {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) { this.fps = Math.round(this.frames / this.acc); this.frames = 0; this.acc = 0; }
    if (!this.visible || (this.refresh -= dt) > 0) return;
    this.refresh = 0.1;
    const t = sm.template;
    const missing = report.placeholder.length;
    const state = sm.paused ? `PAUSE（${sm.state}）` : sm.state;
    const tut = sm.state === 'TUTORIAL';
    const vo = extra.voice;
    const lines = [
      `<b style="font-size:14px">${state}</b> <span style="opacity:.75">${sm.paused ? '暂停中' : STATE_CN[sm.state] || ''}</span>`,
      `步骤：${sm.stepName || '—'}`,
      sm.canNext() ? (tut ? '<span style="color:#ffe08a">▶ 看到孩子做了就按 Space；孩子没明白按 T（让游戏再提示），别开口教</span>' : '<span style="color:#ffe08a">▶ 等待家长按“下一步”</span>') : '',
      vo && vo.subtitle && vo.subtitleT < 6 ? `<span style="color:#ffd2a8">Narrator: “${vo.subtitle}”</span>` : '',
      `第 ${sm.round}/${t.rounds} 轮 · 本轮哈气 ${sm.huffInRound}/${t.huffs} · 全局哈气 ${sm.globalHuff}`,
      sm.fx?.egg ? `龙蛋：${sm.fx.egg.stageName} · 星座 ${sm.fx.sky.lit}/${sm.fx.sky.total} 颗` : '',
      `FPS ${this.fps} · 缺失素材 ${missing}（占位）+ ${report.procedural.length}（代码生成）· 音频缺 ${report.audioMissing.length}`,
      extra.audioLocked ? '<span style="color:#ffb0b0">🔇 点击页面或按任意键启用声音</span>' : '',
      extra.autoplay ? '<span style="color:#9fe8b0">● 自动播放中（D 停止）</span>' : '',
      '<span style="opacity:.8">Space 下一步/孩子做到了 · T 提示 · S 跳过引导 · P 暂停/继续 · E 结束 · R 重新开始 · L 重读 layout · H 隐藏 · D 自动播放 · C 喷嚏 · B 拍背 · 拖动鼠标转头</span>',
      '<span style="opacity:.65">节奏参数为示意，非临床参数</span>',
    ].filter(Boolean);
    this.el.innerHTML = lines.join('<br>');
  }
}
