// 入口：renderer、XR、主循环
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { CONFIG, scaleNearFx } from './config.js';
import { initAssets, initVersion, fetchJSON, printReport, report, assetVersion } from './assets.js';
import { Layout } from './layout.js';
import { Mochi } from './mochi.js';
import { Effects } from './effects.js';
import { AudioMgr } from './audio.js';
import { StateMachine } from './stateMachine.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Head } from './head.js';
import { Voice } from './voice.js';
import { Tutorial } from './tutorial.js';
import { DEG, clamp } from './util.js';

// ───────────── renderer / XR ─────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);
initAssets(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.world.bgGray);
const world = new THREE.Group(); // 所有内容都在这里（重新居中时整体转）
world.name = 'world';
scene.add(world);

const camera = new THREE.PerspectiveCamera(CONFIG.desktop.fov, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 1.1, 0); // 桌面模式：孩子眼高 1.1，看向 -z
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 桌面模式：鼠标拖动小范围转头（方便录电脑画面）；鼠标移动时视点跟着平移一点（视差，看得出前后层次）
const look = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0, px: 0, py: 0, ox: 0, oy: 0, lastMove: -1e9 };
renderer.domElement.addEventListener('pointerdown', (e) => { look.drag = true; look.x = e.clientX; look.y = e.clientY; });
window.addEventListener('pointerup', () => { look.drag = false; });
window.addEventListener('pointermove', (e) => {
  look.px = (e.clientX / window.innerWidth) * 2 - 1;
  look.py = (e.clientY / window.innerHeight) * 2 - 1;
  look.lastMove = performance.now();
  if (!look.drag) return;
  const D = CONFIG.desktop;
  look.yaw = clamp(look.yaw - (e.clientX - look.x) * D.dragSensitivity, -D.maxYawDeg, D.maxYawDeg);
  look.pitch = clamp(look.pitch - (e.clientY - look.y) * D.dragSensitivity, -D.maxPitchDeg, D.maxPitchDeg);
  look.x = e.clientX; look.y = e.clientY;
});

// ───────────── 启动 ─────────────
async function boot() {
  await initVersion();
  const P = CONFIG.paths;
  const [tpl, lay, piv, poses, vo] = await Promise.all([
    fetchJSON(P.template, CONFIG.templateDefaults),
    fetchJSON(P.layout, CONFIG.layoutDefaults),
    fetchJSON(P.pivots, {}),
    fetchJSON(P.poses, null),
    fetchJSON(P.voice, { lines: {} }),
  ]);
  const template = { ...CONFIG.templateDefaults, ...tpl.data };
  console.log('[template] 示意，非临床参数：', template);

  const audio = new AudioMgr(camera);
  const voice = new Voice(audio, vo.data);
  const audioLoad = Promise.all([audio.loadAll(), voice.loadAll()]);
  const head = new Head(renderer, camera, world);

  const layout = new Layout(world);
  let settings = await layout.build(lay.data);
  console.log(`[mochi] Mochi 高 ${settings.height} m → 身边特效放大 ×${scaleNearFx(settings.height).toFixed(2)}`);
  const mochi = await Mochi.create(world, world, piv.data, settings, poses.data);
  const fx = await Effects.create(world, scene, layout, settings, mochi, audio);
  await audioLoad;

  const sm = new StateMachine({ template, mochi, fx, audio, getSettings: () => settings });
  sm.tutorial = await Tutorial.create(world, { mochi, fx, voice, head, audio, layout, template, settings: () => settings });
  sm.voice = voice;
  const hud = new Hud();

  // ── P1：录制自动播放（按 D，或网址加 ?autoplay=1 进 VR 后自动开始） ──
  const autoplay = {
    on: false, t: 0,
    toggle(v = !this.on) {
      this.on = v; this.t = 0;
      console.log(`[autoplay] ${v ? '开始：按固定间隔模拟“下一步/确认哈气”' : '停止'}`);
      if (v && sm.state === 'END') sm.restart();
    },
    update(dt) {
      if (!this.on) return;
      if (!sm.canNext()) { this.t = 0; if (sm.state === 'END' && !sm.paused) this.on = false; return; }
      this.t += dt;
      const A = CONFIG.autoplay;
      if (this.t >= (sm.state === 'HUFF' ? A.huffIntervalSec : A.intervalSec)) { this.t = 0; sm.next(); }
    },
  };
  const wantAutoplay = new URLSearchParams(location.search).has('autoplay');

  // ── P1：重新居中（让内容正对当前头的朝向） ──
  const recenter = () => {
    if (!renderer.xr.isPresenting) { look.yaw = 0; look.pitch = 0; return; }
    const xrCam = renderer.xr.getCamera();
    const pos = new THREE.Vector3(), q = new THREE.Quaternion();
    xrCam.getWorldPosition(pos); xrCam.getWorldQuaternion(q);
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    world.position.set(pos.x, 0, pos.z);
    world.rotation.set(0, yaw, 0);
    console.log(`[recenter] yaw ${(yaw / DEG).toFixed(1)}°, pos (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
  };

  const applySettings = (s) => {
    if (!s) return;
    settings = s;
    scaleNearFx(s.height);
    mochi.applyLayout(s);
    fx.applyLayout(s);
  };

  const input = new Input(renderer, {
    next: () => sm.next(),
    hint: () => sm.hint(),
    skipTutorial: () => sm.skipTutorial(),
    pause: () => sm.togglePause(),
    end: () => { autoplay.on = false; sm.end(); },
    restart: () => { sm.restart(); if (autoplay.on) autoplay.t = 0; },
    reloadLayout: async () => applySettings(await layout.reload()),
    toggleHud: () => hud.toggle(),
    autoplay: () => autoplay.toggle(),
    recenter,
    sneeze: () => {
      if (!template.includeCough) { console.log('[喷嚏] 模板 includeCough=false，忽略（只在方案有安排时触发）'); return; }
      if (sm.paused || !(sm.state === 'HUFF' && sm.canNext())) { console.log('[喷嚏] 只在 HUFF 等待时可用'); return; }
      fx.orb.wiggleAt(mochi.mouthWorld(), () => {
        audio.play('sfx_sneeze');
        mochi.sneeze(() => {
          const p = mochi.mouthWorld();
          fx.sparks.burst(p, 24, { speed: 0.6, up: 0.05, life: [0.6, 1.1], size: [0.02, 0.05], colors: ['#ffffff', '#e8e4ff'], grav: 0, drag: 1.2 });
          const t = fx.nextFogTarget(sm.globalHuff);
          if (t) { const fog = [...layout.layers.values()].find((L) => L.kind === 'fog' && !L.melted && L.base.distanceTo(t) < 0.01); if (fog) { fog.offset.x += 0.04; setTimeout(() => { fog.offset.x -= 0.04; }, 600); } }
        });
      });
    },
    percussion: () => {
      if (!template.includePercussion) { console.log('[拍背] 模板 includePercussion=false，忽略'); return; }
      fx.orb.flash(); audio.play('sfx_pat_drum', { vol: 0.7 });
      mochi.setWings('flap', 0.1); setTimeout(() => mochi.setWings(mochi.flying && sm.state === 'FLY' ? 'flap' : 'fold'), 350);
    },
  });
  const unlockAudio = () => audio.unlock();
  input.onAny = unlockAudio;
  window.addEventListener('pointerdown', unlockAudio);
  vrButton.addEventListener('click', unlockAudio);
  renderer.xr.addEventListener('sessionstart', () => {
    audio.unlock();
    renderer.xr.setFoveation(1);
    hud.el.style.display = 'none';
    if (wantAutoplay) setTimeout(() => { if (!autoplay.on) autoplay.toggle(true); }, CONFIG.autoplay.startDelaySec * 1000);
  });
  renderer.xr.addEventListener('sessionend', () => { if (hud.visible) hud.el.style.display = ''; world.position.set(0, 0, 0); world.rotation.set(0, 0, 0); });

  document.getElementById('loading')?.remove();
  printReport();
  console.log(`[mochi] 素材版本 ?v=${assetVersion()}。键盘：Space 下一步/孩子做到了 · T 提示 · S 跳过引导 · P 暂停 · E 结束 · R 重新开始 · L 重读 layout · H 隐藏面板 · D 自动播放`);

  sm.start();

  // 调试用：控制台里 window.mochiDemo.sm.next() 等
  window.mochiDemo = { THREE, scene, world, renderer, camera, layout, mochi, fx, audio, sm, input, autoplay, report, CONFIG, template, look, head, voice, tutorial: sm.tutorial };

  // ───────────── 主循环 ─────────────
  const timer = new THREE.Timer();
  let t = 0, infoT = 0;
  const frame = (dt) => {
    t += dt;
    input.poll(dt);
    autoplay.update(dt);
    head.update(dt);
    voice.update(dt);
    sm.update(dt);
    mochi.update(dt, t);
    fx.update(dt, t);
    layout.update(dt, t);
    if (!renderer.xr.isPresenting) {
      camera.rotation.set(look.pitch * DEG, look.yaw * DEG, 0, 'YXZ');
      // 视差：鼠标位置 → 视点平移；鼠标停下一会儿后缓慢左右晃（录屏也看得出远近）
      const P = CONFIG.desktop.parallax;
      const idle = performance.now() - look.lastMove > P.idleAfterSec * 1000;
      const tx = (idle ? 0 : look.px * P.x) + (idle ? Math.sin(t * 2 * Math.PI / P.swaySec) * P.sway : 0);
      const ty = idle ? Math.sin(t * 2 * Math.PI / (P.swaySec * 1.6)) * P.sway * 0.4 : -look.py * P.y;
      const k = Math.min(1, dt * 3);
      look.ox += (tx - look.ox) * k; look.oy += (ty - look.oy) * k;
      camera.position.set(look.ox, 1.1 + look.oy, 0);
    }
    hud.update(dt, sm, { audioLocked: !audio.unlocked, autoplay: autoplay.on, voice });
    renderer.render(scene, camera);
    if ((infoT += dt) >= CONFIG.debug.infoLogSec) {
      infoT = 0;
      const i = renderer.info;
      console.log(`[perf] fps≈${hud.fps} calls=${i.render.calls} tris=${i.render.triangles} textures=${i.memory.textures} geometries=${i.memory.geometries} programs=${i.programs?.length ?? '?'}`);
    }
  };
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    frame(Math.min(0.1, timer.getDelta()));
  });
  // 调试：页面在后台时 rAF 不跑，可以在控制台用 mochiDemo.advance(秒) 手动推进
  window.mochiDemo.advance = (sec, step = 1 / 30) => { for (let k = 0; k < Math.ceil(sec / step); k++) frame(step); };
}

boot().catch((e) => {
  console.error('[mochi] 启动失败', e);
  const el = document.getElementById('loading');
  if (el) el.textContent = `启动失败：${e.message}（看控制台）`;
});
