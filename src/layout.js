// 读取 assets/layout.json，摆放各层（背景、雾团）。每层一张 PlaneGeometry，正面朝 +z（朝向孩子）。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { tryLoadTexture, makePlaceholder, report, fetchJSON } from './assets.js';
import { vec3, depthOrder, Tween, DEG } from './util.js';

export const PLANE = new THREE.PlaneGeometry(1, 1);
export const sharedBright = { value: 1 };
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
  diffuseColor *= sampledDiffuseColor;
#endif
`;

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
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGray;\nuniform sampler2D uMapB;\nuniform float uHasB;\nuniform vec3 uTint;\nuniform float uBright;')
      .replace('#include <map_fragment>', FRAG);
  };
  mat.customProgramCacheKey = () => 'mochiLayer';
  return mat;
}

export class LayerPlane {
  constructor(key, kind, texA, texB, { gray = 0 } = {}) {
    this.key = key; this.kind = kind;
    this.mat = makeLayerMaterial(texA.tex, texB?.tex || null, { gray });
    this.mesh = new THREE.Mesh(PLANE, this.mat);
    this.mesh.name = key;
    this.aspect = texA.h / texA.w || 1;
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
      case 'bob': oy = Math.sin((t + this.phase) * 2 * Math.PI / 4) * 0.02; break;
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
    this.mesh.scale.set(w, w * this.aspect, 1);
    this.mat.opacity = alpha;
    this.mesh.visible = this.enabled && alpha > 0.002;
  }
  get center() { return this.base.clone().add(new THREE.Vector3(0, CONFIG.melt.rise * this.melt.v, 0)); }
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
  return { height, homePos, groundY, flightPos, band, orbRest, zones, eyeHeight: +(data.eyeHeight ?? 1.1) };
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
    const dir = e.kind === 'fog' ? CONFIG.paths.fog : CONFIG.paths.bg;
    const name = e.file || e.key;
    const phAspect = e.h && e.w ? e.h / e.w : 1;
    const isColorGray = R.colorGray.includes(e.key) || e.mode === 'colorGray';
    const isClosedOpen = R.closedOpen.includes(e.key) || e.mode === 'closedOpen';
    if (isColorGray || isClosedOpen) {
      const [sa, sb] = isColorGray ? ['color', 'gray'] : ['open', 'closed'];
      const exts = isColorGray ? R.exts : ['.png'];
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
      return new LayerPlane(e.key, e.kind, A, B, { gray: 1 });
    }
    const path = `${dir}${name}.png`;
    let A = await tryLoadTexture([path]);
    if (!A) {
      if (e.optional) { report.optionalMissing.push(path); return null; }
      A = makePlaceholder(path, { aspect: phAspect });
      report.placeholder.push(path);
    }
    return new LayerPlane(e.key, e.kind, A, null, { gray: 0 });
  }

  update(dt, t) { for (const L of this.layers.values()) L.update(dt, t); }
}
