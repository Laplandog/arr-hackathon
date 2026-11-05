// 读取 assets/layout.json，摆放各层（背景、雾团）。每层一张 PlaneGeometry，正面朝 +z（朝向孩子）。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { tryLoadTexture, makePlaceholder, report, fetchJSON } from './assets.js';
import { vec3, depthOrder, Tween, DEG } from './util.js';

export const PLANE = new THREE.PlaneGeometry(1, 1);
export const sharedBright = { value: 1 };
// 空气透视：远处的层往这个颜色（天空地平线的颜色，灰/彩跟着天空变）混一点
export const sharedHaze = { value: new THREE.Color(0.75, 0.72, 0.8) };
const TINT = new THREE.Vector3(...CONFIG.layerRules.grayTint);

const FRAG = /* glsl */ `
#ifdef USE_MAP
  vec4 texA = texture2D( map, vMapUv );
  vec4 texB = texture2D( uMapB, vMapUv );
  float lumA = dot( texA.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec4 synthGray = vec4( vec3( lumA ) * uTint, texA.a );
  vec4 grayC = mix( synthGray, texB, uHasB );
  vec4 sampledDiffuseColor = mix( texA, grayC, uGray );
  sampledDiffuseColor.rgb *= uBright;
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, uHazeColor, uHaze );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/** 按离孩子的距离算空气透视的强度 */
export function hazeFor(pos) {
  const H = CONFIG.world.haze;
  const d = Math.hypot(pos.x, pos.y - CONFIG.layoutDefaults.eyeHeight, pos.z);
  return Math.max(0, Math.min(1, (d - H.near) / (H.far - H.near))) * H.max;
}

/**
 * 所有贴图层共用的材质：MeshBasicMaterial + 灰/彩混合。
 * uGray: 1 = 灰版（或合上的花）, 0 = 彩色。没有灰版图时 shader 实时去饱和偏灰紫。
 */
export function makeLayerMaterial(mapA, mapB = null, { gray = 0, side = THREE.FrontSide, additive = false } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: mapA, transparent: true, depthWrite: false, side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const u = {
    uGray: { value: gray }, uMapB: { value: mapB || mapA }, uHasB: { value: mapB ? 1 : 0 },
    uTint: { value: TINT }, uBright: sharedBright,
    uHaze: { value: 0 }, uHazeColor: sharedHaze,
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGray;\nuniform sampler2D uMapB;\nuniform float uHasB;\nuniform vec3 uTint;\nuniform float uBright;\nuniform float uHaze;\nuniform vec3 uHazeColor;')
      .replace('#include <map_fragment>', FRAG);
  };
  mat.customProgramCacheKey = () => 'mochiLayer';
  return mat;
}

/**
 * 找出图片里不透明内容的范围（归一化，v 从上往下）。美术常在大画布上导出、四周大片透明：
 * 裁掉后 layout 的 w 就是“看得见的内容宽度”，也避免在 Quest 上叠出很多全屏透明平面拖慢帧率。
 */
function alphaBBox(img, force = false) {
  const T = CONFIG.layerRules.trim;
  const s = Math.min(1, T.scanPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  const m = T.margin * Math.max(w, h);
  const bb = {
    u0: Math.max(0, (x0 - m) / w), v0: Math.max(0, (y0 - m) / h),
    u1: Math.min(1, (x1 + 1 + m) / w), v1: Math.min(1, (y1 + 1 + m) / h),
  };
  return force || (bb.u1 - bb.u0) * (bb.v1 - bb.v0) < T.maxAreaToTrim ? bb : null;
}

/** 一组同画布的帧（例如火苗 01→03 从小到大）用同一个裁切框，保留帧之间的大小变化 */
export function trimTexturesUnion(list) {
  if (!CONFIG.layerRules.trim.enabled || !list.length) return null;
  const bbs = [];
  for (const t of list) {
    if (t.placeholder || t.procedural || !t.tex?.image) return null;
    try { const b = alphaBBox(t.tex.image, true); if (b) bbs.push(b); } catch { return null; }
  }
  if (!bbs.length) return null;
  const u = {
    u0: Math.min(...bbs.map((b) => b.u0)), v0: Math.min(...bbs.map((b) => b.v0)),
    u1: Math.max(...bbs.map((b) => b.u1)), v1: Math.max(...bbs.map((b) => b.v1)),
  };
  if ((u.u1 - u.u0) * (u.v1 - u.v0) >= CONFIG.layerRules.trim.maxAreaToTrim) return null;
  for (const t of list) {
    t.tex.repeat.set(u.u1 - u.u0, u.v1 - u.v0);
    t.tex.offset.set(u.u0, 1 - u.v1);
    t.tex.needsUpdate = true;
  }
  return { w: (u.u1 - u.u0) * list[0].w, h: (u.v1 - u.v0) * list[0].h };
}

/** 把贴图裁到内容范围（只改 UV，不改文件）；返回裁后的宽高像素 */
export function trimTexture(t) {
  if (!CONFIG.layerRules.trim.enabled || t.placeholder || !t.tex?.image) return null;
  let bb = null;
  try { bb = alphaBBox(t.tex.image); } catch { return null; }
  if (!bb) return null;
  t.tex.repeat.set(bb.u1 - bb.u0, bb.v1 - bb.v0);
  t.tex.offset.set(bb.u0, 1 - bb.v1); // flipY：图片顶部是 v = 1
  t.tex.needsUpdate = true;
  return { w: (bb.u1 - bb.u0) * t.w, h: (bb.v1 - bb.v0) * t.h };
}

export class LayerPlane {
  constructor(key, kind, texA, texB, { gray = 0 } = {}) {
    this.key = key; this.kind = kind;
    // 灰版/合上版和彩版是同一张画布导出的，shader 里用同一组 UV，所以只按彩版裁
    const trimmed = trimTexture(texA);
    if (trimmed) console.log(`[layout] ${key}：自动裁掉透明边 ${texA.w}×${texA.h} → ${Math.round(trimmed.w)}×${Math.round(trimmed.h)}`);
    const size = trimmed || texA;
    this.mat = makeLayerMaterial(texA.tex, texB?.tex || null, { gray });
    this.mesh = new THREE.Mesh(PLANE, this.mat);
    this.mesh.name = key;
    this.aspect = size.h / size.w || 1;
    this.gray = new Tween(gray);
    this.startGray = gray; // 配对层（灰/彩、合上/开放）从 1 开始
    this.base = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.w = 1; this.scaleMul = 1; this.opacity = 1; this.enabled = true;
    this.anim = null; this.phase = Math.random() * 10;
    this.melt = new Tween(0); this.melted = false; // 雾团用
  }
  applyEntry(e) {
    this.base.copy(vec3(e.pos));
    this.w = e.w;
    this.mesh.renderOrder = depthOrder(this.base.z, +e.order || 0);
    this.anim = e.anim ?? CONFIG.layerRules.animByName.find((r) => this.key.includes(r.match))?.anim ?? null;
    if (this.kind === 'fog' && !e.anim) this.anim = 'fog';
    // "flipX": true 水平翻转（同一张图换个方向再用一次）；翻转后背面朝孩子，所以改成双面
    this.flipX = !!e.flipX;
    if (this.flipX && this.mat.side !== THREE.DoubleSide) { this.mat.side = THREE.DoubleSide; this.mat.needsUpdate = true; }
    this.bobAmp = e.bobAmp != null ? +e.bobAmp : 0.02;
    this.bobSec = e.bobSec != null ? +e.bobSec : 4;
    // 空气透视：layout 里写 "haze": 0~1 可以覆盖自动值
    this.mat.userData.u.uHaze.value = e.haze != null ? +e.haze : hazeFor(this.base);
    // grayStart：单张彩图也从灰色开始（属于某个区域就随区域恢复，否则 END 天空放晴时恢复）
    if (e.grayStart && !this._grayInit) { this.startGray = 1; this.gray.set(1); }
    this._grayInit = true;
    this.enabled = true;
  }
  update(dt, t) {
    this.mat.userData.u.uGray.value = this.gray.update(dt);
    const m = this.melt.update(dt);
    let ox = 0, oy = 0, rz = 0, s = 1;
    const W = CONFIG.world;
    switch (this.anim) {
      case 'sway': rz = Math.sin((t + this.phase) * 2 * Math.PI / 5) * 1.2 * DEG; ox = Math.sin((t + this.phase) * 2 * Math.PI / 5) * 0.01; break;
      case 'drift': ox = Math.sin((t + this.phase) * 2 * Math.PI / 14) * 0.06; oy = Math.sin((t + this.phase) * 2 * Math.PI / 9) * 0.01; break;
      case 'bob': oy = Math.sin((t + this.phase) * 2 * Math.PI / this.bobSec) * this.bobAmp; rz = Math.sin((t + this.phase) * 2 * Math.PI / (this.bobSec * 1.7)) * 0.6 * DEG; break;
      case 'fog': {
        const ph = (t + this.phase) * 2 * Math.PI / W.fogIdlePeriod;
        oy = Math.sin(ph) * W.fogIdleBob; s = 1 + Math.sin(ph * 0.8 + 1) * W.fogIdleBreath;
        break;
      }
    }
    // 雾融化：1.2 秒内透明度 1→0、整体放大 1.15、向上飘 0.2 m
    const M = CONFIG.melt;
    const alpha = this.opacity * (1 - m);
    s *= 1 + (M.scaleTo - 1) * m;
    oy += M.rise * m;
    this.mesh.position.set(this.base.x + ox + this.offset.x, this.base.y + oy + this.offset.y, this.base.z + this.offset.z);
    this.mesh.rotation.z = rz;
    const w = this.w * s * this.scaleMul;
    this.mesh.scale.set(this.flipX ? -w : w, w * this.aspect, 1);
    this.mat.opacity = alpha;
    this.mesh.visible = this.enabled && alpha > 0.002;
  }
  get center() { return this.base.clone().add(new THREE.Vector3(0, CONFIG.melt.rise * this.melt.v, 0)); }
}

// ───────────── 天幕：把天空图贴在包住孩子的大球内侧，头转到哪里都看不到纸边 ─────────────
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform sampler2D map; uniform sampler2D uMapB; uniform float uHasB;
uniform float uGray; uniform vec3 uTint; uniform float uBright;
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uTopB; uniform vec3 uBottomB;
uniform vec4 uEl;      // x = 图片下沿仰角, y = 上沿仰角, z = 开始渐变到顶色的仰角, w = 开始渐变到底色的仰角（弧度）
uniform float uSpan;   // 图片横向覆盖多少度（弧度），其余部分镜像接上
varying vec3 vDir;
float tri(float x) { return 1.0 - abs(mod(x, 2.0) - 1.0); } // 镜像往复：0→1→0，接缝连续
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z);                 // 0 = 正前方，右为正
  float el = asin(clamp(d.y, -1.0, 1.0));
  float u = tri(0.5 + az / uSpan);
  float v = clamp((el - uEl.x) / (uEl.y - uEl.x), 0.0, 1.0);
  vec2 uv = vec2(u, v);
  // 超出图片上下沿后完全是纯色：头顶 / 脚下不会出现被拉长的放射条纹
  float ft = smoothstep(uEl.z, uEl.y, el);           // 头顶：渐变成上沿颜色
  float fb = 1.0 - smoothstep(uEl.x, uEl.w, el);     // 脚下：渐变成下沿颜色
  vec3 col = texture2D(map, uv).rgb;
  col = mix(mix(col, uTop, ft), uBottom, fb);
  vec3 colB = texture2D(uMapB, uv).rgb;
  colB = mix(mix(colB, uTopB, ft), uBottomB, fb);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 g = mix(vec3(lum) * uTint, colB, uHasB);
  gl_FragColor = vec4(mix(col, g, uGray) * uBright, 1.0);
  #include <colorspace_fragment>
}`;

/** 图片上沿 / 下沿几行的平均色（线性空间），给天幕头顶和脚下做渐变 */
function edgeColor(img, top) { return rowColor(img, top ? 0 : 30 / 32); }

/** 图片某一高度（从上往下 0~1）一行的平均色（线性空间） */
export function rowColor(img, fromTop) {
  const out = new THREE.Color(0.6, 0.6, 0.65);
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 64, 32);
    const row = Math.max(0, Math.min(30, Math.round(fromTop * 32)));
    const d = g.getImageData(0, row, 64, 2).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    out.setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch { /* 用默认色 */ }
  return out;
}

export class SkyDome {
  constructor(key, texA, texB, { gray = 1 } = {}) {
    this.key = key; this.kind = 'bg'; this.isDome = true;
    this.gray = new Tween(gray); this.startGray = gray;
    this.melt = new Tween(0); this.melted = false; this.enabled = true;
    this.base = new THREE.Vector3(); this.offset = new THREE.Vector3(); this.w = 1; this.aspect = 1; this.opacity = 1;
    const imgA = texA.tex.image, imgB = texB?.tex.image;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texA.tex }, uMapB: { value: texB?.tex || texA.tex }, uHasB: { value: texB ? 1 : 0 },
        uGray: { value: gray }, uTint: { value: TINT }, uBright: sharedBright,
        uTop: { value: edgeColor(imgA, true) }, uBottom: { value: edgeColor(imgA, false) },
        uTopB: { value: imgB ? edgeColor(imgB, true) : new THREE.Color() }, uBottomB: { value: imgB ? edgeColor(imgB, false) : new THREE.Color() },
        uEl: { value: new THREE.Vector4() }, uSpan: { value: Math.PI },
      },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false,
    });
    this.mat.userData.u = { uGray: this.mat.uniforms.uGray };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.layerRules.dome.radius, 64, 32), this.mat);
    this.mesh.name = key;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1e9; // 最先画
  }
  applyEntry(e) {
    const D = CONFIG.layerRules.dome;
    const [lo, hi] = Array.isArray(e.elevation) ? e.elevation : D.elevation;
    const span = +(e.spanDeg ?? D.spanDeg);
    this.mat.uniforms.uEl.value.set(lo * DEG, hi * DEG, (hi - D.fadeDeg) * DEG, (lo + D.fadeDeg) * DEG);
    this.mat.uniforms.uSpan.value = span * DEG;
    // 地平线（仰角 0°）那一行的颜色 → 空气透视用
    this.horizon = rowColor(this.mat.uniforms.map.value.image, 1 - (0 - lo) / (hi - lo));
    this.mesh.position.set(0, +(e.centerY ?? CONFIG.layoutDefaults.eyeHeight), 0);
    this.base.copy(vec3(e.pos));
    this.enabled = true;
  }
  update(dt) {
    this.mat.uniforms.uGray.value = this.gray.update(dt);
    this.melt.update(dt);
    this.mesh.visible = this.enabled;
  }
  get center() { return this.base.clone(); }
}

/** 把 layout.json 里各种可能的写法统一成 [{key, kind, pos, w, h, ...}] */
export function parseLayout(data) {
  const out = new Map();
  const push = (key, v, hint) => {
    if (!key || typeof key !== 'string' || key.startsWith('_') || !v || typeof v !== 'object') return;
    if (v.enabled === false) return;
    const pos = v.pos ?? v.position;
    const w = +(v.w ?? v.width);
    if (!pos || !(w > 0)) { console.warn(`[layout] ${key} 缺少 pos 或 w，跳过`); return; }
    const kind = key.startsWith('fog') ? 'fog' : (hint || 'bg');
    out.set(key, { ...v, key, kind, pos, w, h: v.h != null ? +v.h : null });
  };
  const eat = (c, hint) => {
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c)) c.forEach((it) => push(it?.key ?? it?.name ?? it?.id, it, hint));
    else for (const [k, v] of Object.entries(c)) push(k, v, hint);
  };
  eat(data.layers, 'bg'); eat(data.bg, 'bg'); eat(data.background, 'bg');
  eat(data.fog, 'fog'); eat(data.fogs, 'fog'); eat(data.items); eat(data.planes);
  for (const [k, v] of Object.entries(data)) if (/^(bg|fog)_/.test(k)) push(k, v);
  return [...out.values()];
}

/** Mochi / 飞行 / 舒适带 / 光团的位置参数 */
export function parseSettings(data) {
  const d = CONFIG.layoutDefaults;
  const m = data.mochi || {}, f = data.flight || {}, cb = data.comfortBand || data.comfort_band || {}, o = data.orb || {};
  const height = +(m.height ?? d.mochi.height) || 0.6;
  const homePos = vec3(m.homePos ?? m.home_pos ?? d.mochi.homePos);
  const groundY = +(f.groundY ?? f.ground_y ?? homePos.y);
  const flightPos = f.pos ? vec3(f.pos) : new THREE.Vector3(homePos.x, groundY, homePos.z);
  flightPos.y = groundY;
  const yMin = +(cb.yMin ?? cb.y_min ?? d.comfortBand.yMin), yMax = +(cb.yMax ?? cb.y_max ?? d.comfortBand.yMax);
  const band = {
    w: +(cb.w ?? d.comfortBand.w), yMin, yMax, center: (yMin + yMax) / 2,
    x: cb.x != null ? +cb.x : flightPos.x, z: cb.z != null ? +cb.z : flightPos.z - 0.06,
  };
  const orbRest = vec3(o.restPos ?? o.rest_pos ?? d.orb.restPos);
  const zones = Array.isArray(data.zones) && data.zones.length ? data.zones : CONFIG.zones;
  const eg = data.egg || {}, cs = data.constellation || {};
  const egg = { pos: vec3(eg.pos ?? CONFIG.egg.pos), h: +(eg.h ?? CONFIG.egg.h) || CONFIG.egg.h };
  const constellation = {
    center: vec3(cs.center ?? CONFIG.constellation.center),
    w: +(cs.w ?? CONFIG.constellation.w) || CONFIG.constellation.w, h: +(cs.h ?? CONFIG.constellation.h) || CONFIG.constellation.h,
  };
  return { height, homePos, groundY, flightPos, band, orbRest, zones, egg, constellation, eyeHeight: +(data.eyeHeight ?? 1.1) };
}

export class Layout {
  constructor(parent) {
    this.parent = parent;
    this.layers = new Map();
    this.settings = null;
    this.data = null;
  }
  get(key) { return this.layers.get(key); }

  async build(data) {
    this.data = data;
    const entries = parseLayout(data);
    const seen = new Set(entries.map((e) => e.key));
    await Promise.all(entries.map((e) => this._ensure(e)));
    for (const [k, L] of this.layers) if (!seen.has(k)) L.enabled = false; // 新 layout 里删掉的层
    this.settings = parseSettings(data);
    return this.settings;
  }

  /** 桌面模式按 L：重新读取 layout.json 并重新摆放（已恢复的颜色保留） */
  async reload() {
    const { data, ok } = await fetchJSON(CONFIG.paths.layout, CONFIG.layoutDefaults, Date.now().toString(36));
    if (!ok) return null;
    const s = await this.build(data);
    console.log('[layout] 已重新读取 layout.json', s);
    return s;
  }

  async _ensure(entry) {
    let L = this.layers.get(entry.key);
    if (!L) {
      if (this._pending?.has(entry.key)) return;
      (this._pending ||= new Set()).add(entry.key);
      L = await this._create(entry);
      this._pending.delete(entry.key);
      if (!L) return;
      this.layers.set(entry.key, L);
      this.parent.add(L.mesh);
    }
    L.applyEntry(entry);
  }

  async _create(e) {
    const R = CONFIG.layerRules;
    // "dir": "fx" 之类可以把特效图（例如保护壳）当作场景层摆进 layout
    const dir = e.dir ? (CONFIG.paths[e.dir] || `${String(e.dir).replace(/\/?$/, '/')}`) : e.kind === 'fog' ? CONFIG.paths.fog : CONFIG.paths.bg;
    const name = e.file || e.key;
    const phAspect = e.h && e.w ? e.h / e.w : 1;
    const isColorGray = R.colorGray.includes(e.key) || e.mode === 'colorGray';
    const isClosedOpen = R.closedOpen.includes(e.key) || e.mode === 'closedOpen';
    if (isColorGray || isClosedOpen) {
      const [sa, sb] = isColorGray ? ['color', 'gray'] : ['open', 'closed'];
      const exts = isColorGray ? R.exts : R.singleExts;
      const cand = (s) => exts.map((ext) => `${dir}${name}_${s}${ext}`);
      const [a, b] = await Promise.all([tryLoadTexture(cand(sa)), tryLoadTexture(cand(sb))]);
      let A = a, B = b;
      if (!A && !B) {
        if (e.optional) { report.optionalMissing.push(cand(sa)[0]); return null; }
        A = makePlaceholder(cand(sa)[0], { aspect: phAspect });
        report.placeholder.push(cand(sa)[0]);
        report.grayByShader.push(cand(sb)[0]);
      } else if (!A) {
        console.warn(`[layout] ${e.key}: 只有 _${sb} 没有 _${sa}，彩色版先用 _${sb} 代替`);
        report.placeholder.push(cand(sa)[0]);
        A = B;
      } else if (!B) {
        report.grayByShader.push(cand(sb)[0]);
      }
      if (e.dome) return new SkyDome(e.key, A, B, { gray: 1 });
      return new LayerPlane(e.key, e.kind, A, B, { gray: 1 });
    }
    const path = `${dir}${name}.png`;
    let A = await tryLoadTexture(R.singleExts.map((ext) => `${dir}${name}${ext}`));
    if (!A) {
      if (e.optional) { report.optionalMissing.push(path); return null; }
      A = makePlaceholder(path, { aspect: phAspect });
      report.placeholder.push(path);
    }
    if (e.dome) return new SkyDome(e.key, A, null, { gray: e.grayStart ? 1 : 0 });
    return new LayerPlane(e.key, e.kind, A, null, { gray: 0 });
  }

  update(dt, t) { for (const L of this.layers.values()) L.update(dt, t); }
}
