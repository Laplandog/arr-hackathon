// 素材加载：素材没到也能跑。缺图 → 自动生成带文件名的占位贴图，并在控制台列出缺失清单。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { hashHue } from './util.js';

/* global __BUILD_VERSION__ */
// 开发模式每次刷新都换版本号（替换 PNG 刷新即生效）；构建版本用构建时间戳。
let VERSION = import.meta.env.DEV ? Date.now().toString(36) : __BUILD_VERSION__;
export const assetVersion = () => VERSION;
export const assetUrl = (path, bust = VERSION) => `${import.meta.env.BASE_URL}${path}?v=${bust}`;

/** 线上版本：不走缓存读 version.json，拿到最新一次部署的时间戳（页面本身被缓存时也能看到新图） */
export async function initVersion() {
  if (import.meta.env.DEV) return VERSION;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j?.v) VERSION = String(j.v); }
  } catch { /* 用构建时间戳 */ }
  return VERSION;
}

export const report = {
  placeholder: [],     // 缺失 → 画了占位矩形
  procedural: [],      // 缺失 → 用代码生成的特效（光团、星星、火苗…）
  optionalMissing: [], // optional 层缺失 → 不显示
  grayByShader: [],    // 没有 _gray / _closed → shader 实时去饱和
  audioMissing: [],
  oversize: [],
  loaded: 0,
};

let maxAniso = 1;
export function initAssets(renderer) {
  maxAniso = renderer.capabilities.getMaxAnisotropy();
}

const loader = new THREE.TextureLoader();
const cache = new Map();

function setupTexture(tex, path) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAniso;
  const img = tex.image;
  const max = CONFIG.debug.maxTextureSize;
  if (img && (img.width > max || img.height > max)) {
    console.warn(`[assets] ${path} 是 ${img.width}×${img.height}，超过 ${max}，Quest 上可能掉帧，建议缩小`);
    report.oversize.push(path);
  }
  tex.needsUpdate = true;
  return tex;
}

/** 依次尝试候选路径，返回第一张加载成功的贴图 {tex, path, w, h}；全部失败返回 null。永不抛错。 */
export function tryLoadTexture(paths) {
  const key = paths.join('|');
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    for (const path of paths) {
      try {
        const tex = await loader.loadAsync(assetUrl(path));
        report.loaded++;
        return { tex: setupTexture(tex, path), path, w: tex.image.width, h: tex.image.height };
      } catch { /* 试下一个 */ }
    }
    return null;
  })();
  cache.set(key, p);
  return p;
}

/** canvas 画一个带文件名的彩色半透明矩形。aspect = 高/宽。rect: 画在 1024 画布里的某块区域（Mochi 部件用）。 */
export function makePlaceholder(label, { aspect = 1, rect = null, canvasPx = 1024 } = {}) {
  const c = document.createElement('canvas');
  const hue = hashHue(label);
  let x, y, w, h;
  if (rect) {
    c.width = c.height = canvasPx;
    [w, h] = [rect[2], rect[3]];
    x = rect[0] - w / 2; y = rect[1] - h / 2;
  } else {
    c.width = 512; c.height = Math.max(64, Math.min(2048, Math.round(512 * aspect)));
    x = 4; y = 4; w = c.width - 8; h = c.height - 8;
  }
  const g = c.getContext('2d');
  const r = Math.min(w, h) * 0.12;
  g.fillStyle = `hsla(${hue}, 65%, 70%, 0.55)`;
  g.strokeStyle = `hsla(${hue}, 70%, 35%, 0.9)`;
  g.lineWidth = Math.max(2, Math.min(w, h) * 0.02);
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
  g.fill(); g.stroke();
  // 文件名
  const name = label.split('/').pop();
  let lines = [name];
  g.font = '600 10px sans-serif';
  if (g.measureText(name).width * (h * 0.22 / 10) > w * 0.92) {
    const cut = name.lastIndexOf('_', Math.ceil(name.length / 2) + 4);
    if (cut > 0) lines = [name.slice(0, cut), name.slice(cut)];
  }
  const longest = Math.max(...lines.map((l) => g.measureText(l).width));
  const fs = Math.max(8, Math.min((h * 0.7) / lines.length, (w * 0.9 * 10) / longest));
  g.font = `600 ${fs}px sans-serif`;
  g.fillStyle = `hsla(${hue}, 60%, 18%, 0.95)`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.1));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return { tex, w: c.width, h: c.height, placeholder: true };
}

/** 读贴图，缺失就给占位图。 */
export async function loadOrPlaceholder(paths, phOpts = {}) {
  const r = await tryLoadTexture(paths);
  if (r) return r;
  report.placeholder.push(paths[0]);
  return { ...makePlaceholder(paths[0], phOpts), path: paths[0] };
}

/** 读贴图，缺失就用代码生成（make() 返回 Texture）。 */
export async function loadOrProcedural(path, make) {
  const r = await tryLoadTexture([path]);
  if (r) return { ...r, procedural: false };
  report.procedural.push(path);
  const tex = make();
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: tex.image.width, h: tex.image.height, procedural: true, path };
}

/** 读 JSON；失败（404、解析错）就用默认值。 */
export async function fetchJSON(path, fallback, bust = VERSION) {
  try {
    const res = await fetch(assetUrl(path, bust), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(await res.text());
    return { data, ok: true };
  } catch (e) {
    console.warn(`[assets] 读取 ${path} 失败（${e.message}），使用代码里的默认值`);
    return { data: structuredClone(fallback), ok: false };
  }
}

/** 代码生成贴图的小工具 */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function printReport() {
  const n = report.placeholder.length;
  console.groupCollapsed(`%c[assets] 已加载 ${report.loaded} 张；缺失占位 ${n}；代码生成 ${report.procedural.length}；音频缺失 ${report.audioMissing.length}`, 'color:#b0641e;font-weight:bold');
  if (n) console.log('缺失（已画占位矩形）：\n  ' + report.placeholder.join('\n  '));
  if (report.procedural.length) console.log('缺失（用代码生成）：\n  ' + report.procedural.join('\n  '));
  if (report.grayByShader.length) console.log('没有灰版（shader 实时去饱和）：\n  ' + report.grayByShader.join('\n  '));
  if (report.optionalMissing.length) console.log('可选层不存在（不显示）：\n  ' + report.optionalMissing.join('\n  '));
  if (report.audioMissing.length) console.log('音频缺失（静默跳过）：\n  ' + report.audioMissing.join('\n  '));
  if (report.oversize.length) console.log('超过 2048 的贴图：\n  ' + report.oversize.join('\n  '));
  console.groupEnd();
}
