// 所有可调数值集中在这里（时长、角度、颜色、粒子数、文件名、按键索引）。
// 节奏参数（几口气、几秒）不在这里，在 public/config/template.json —— 示意，非临床参数。

export const CONFIG = {
  paths: {
    template: 'config/template.json',
    layout: 'assets/layout.json',
    pivots: 'assets/mochi/mochi_pivots.json',
    poses: 'assets/mochi/mochi_poses.json',
    bg: 'assets/bg/',
    fog: 'assets/fog/',
    mochi: 'assets/mochi/',
    fx: 'assets/fx/',
    orb: 'assets/orb/',
    audio: 'assets/audio/',
  },

  // template.json 读不到时的兜底（示意，非临床参数）
  templateDefaults: {
    rounds: 2, expansionBreaths: 3, inhaleSec: 3, holdSec: 2, exhaleSec: 3,
    huffs: 2, includeCough: false, includePercussion: false,
  },

  // layout.json 读不到时的兜底（与 public/assets/layout.json 相同的默认摆放）
  layoutDefaults: {
    eyeHeight: 1.1,
    layers: {
      bg_00_sky: { pos: [0, 1.6, -14], w: 56, h: 28, dome: true },
      bg_10_far_islands: { pos: [0, 1.7, -9], w: 11, h: 3.2 },
      bg_30_island_left: { pos: [-2.4, 1.0, -4.5], w: 2.6, h: 1.6 },
      bg_31_island_right: { pos: [2.4, 1.0, -4.5], w: 2.6, h: 1.6 },
      bg_40_island_main: { pos: [0, 0.3, -2.4], w: 3.6, h: 1.3 },
      bg_41_flowers: { pos: [-0.85, 0.72, -2.15], w: 0.9, h: 0.45 },
    },
    fog: {
      fog_puff_01: { pos: [0.3, 2.0, -8.6], w: 3.6, h: 2.0 },
      fog_puff_02: { pos: [-2.3, 1.25, -4.3], w: 1.8, h: 1.1 },
      fog_puff_03: { pos: [2.3, 1.25, -4.3], w: 1.8, h: 1.1 },
      fog_puff_04: { pos: [-0.85, 0.85, -2.05], w: 1.0, h: 0.6 },
    },
    mochi: { height: 0.6, homePos: [0, 0.86, -1.6] },
    flight: { groundY: 0.86 },
    comfortBand: { w: 1.1, yMin: 1.3, yMax: 1.5 },
    orb: { restPos: [0.55, 1.25, -1.25] },
  },

  layerRules: {
    // 这些键加载 {键}_color + {键}_gray，灰→彩交叉淡入
    colorGray: ['bg_00_sky', 'bg_10_far_islands', 'bg_30_island_left', 'bg_31_island_right', 'bg_40_island_main'],
    // 这些键加载 {键}_closed + {键}_open，合上→开放（主岛花丛分小号 / 大号）
    closedOpen: ['bg_41_flowers', 'bg_41_flowers_small', 'bg_41_flowers_big'],
    // 依次尝试的扩展名（天空可能是 .jpg；网页上传时常见大写 .PNG，网站区分大小写，所以也试大写）
    exts: ['.png', '.PNG', '.jpg', '.JPG'],
    singleExts: ['.png', '.PNG'],
    // 没有 _gray 时 shader 实时去饱和并偏灰紫：mix(color, luminance * tint, u_gray)
    grayTint: [0.78, 0.74, 0.86],
    // 名字里带这些词的层自动加一点动画（P1：前景草、近云）
    animByName: [
      { match: 'grass', anim: 'sway' },
      { match: 'cloud', anim: 'drift' },
    ],
    skyKey: 'bg_00_sky',
    // 天幕（layout 里 "dome": true 的层）：贴在半径 radius 米的大球内侧。
    // 图片下沿/上沿对应仰角 elevation（度）；正前方 spanDeg 度显示原图，身后镜像接上；离上下沿 fadeDeg 度开始渐变成边缘颜色
    dome: { radius: 40, elevation: [-45, 60], spanDeg: 180, fadeDeg: 15 },
    // 自动裁掉四周透明边（只改 UV，不动文件）。内容面积小于整张的 85% 才裁。layout.json 的 w = 看得见的内容宽度
    trim: { enabled: true, scanPx: 512, margin: 0.005, maxAreaToTrim: 0.85 },
  },

  // 全局哈气计数 → 区域。layout.json 里写 "zones" 可以覆盖。
  zones: [
    { fog: 'fog_puff_01', layers: ['bg_10_far_islands'] },            // z1 远景岛
    { fog: 'fog_puff_02', layers: ['bg_30_island_left'] },            // z2 左岛
    { fog: 'fog_puff_03', layers: ['bg_31_island_right'] },           // z3 右岛
    { fog: 'fog_puff_04', layers: ['bg_40_island_main', 'bg_41_flowers', 'bg_41_flowers_small', 'bg_41_flowers_big',
      'bg_42_nest_back', 'bg_42_nest_front', 'bg_60_fg_grass_left', 'bg_60_fg_grass_right'] }, // z4 主岛花丛 + 小窝 + 前景草
  ],

  world: {
    bgGray: '#a29db0',      // 雾天背景色（天空图后面）
    bgClear: '#c6b9d3',     // 放晴后的背景色（接近天空图顶部的淡紫，边缘不露色）
    endBrightness: 1.08,    // END 时整体亮度略升
    skyClearSec: 3,
    fogIdleBob: 0.015,      // 雾团待机上下浮动（米）
    fogIdleBreath: 0.02,    // 雾团待机缩放起伏
    fogIdlePeriod: 5,
  },

  melt: {
    dur: 1.2, scaleTo: 1.15, rise: 0.2,
    particlesMin: 20, particlesMax: 40,
    recolorDelay: 0.4, recolorDur: 1.5,
    colors: ['#ffd27a', '#ffb36b', '#fff1b8', '#ffc9a8'],
  },

  mochi: {
    // 整图姿势模式：有 mochi_poses.json 且 idle + sleep 两张图存在时启用（美术交的是整张姿势图，不是拆件）。
    // 各姿势按状态切换；飞行/呼吸/哈气靠整张图的位移、缩放、倾斜表现。没有这些图时退回拆件模式。
    sprite: {
      files: {
        idle: 'mochi_pose_idle', sleep: 'mochi_pose_sleep', rest: 'mochi_pose_rest', happy: 'mochi_pose_happy',
        huff: 'mochi_pose_huff', sneeze: 'mochi_pose_sneeze', dizzy: 'mochi_pose_dizzy',
      },
      faceFogMode: 'flip',   // 哈气时纸片翻面朝向雾
      fadeSec: 0.3, exprFadeSec: 0.15, quickFadeSec: 0.1, // 站↔睡 / 站姿换表情 / 哈气、喷嚏这种瞬间表情
      sleepBreathAmp: 0.03,  // 睡觉时整张图 y 缩放 1.0↔1.03
      bellyStretchY: 0.6, bellyStretchX: 0.35, // 吸气 belly 1→1.08 换算成整张图的拉伸
      flap: { deg: 2.5, bob: 0.025, squash: 0.02 }, // “扇翅膀”：整张图小幅摇摆上下弹
      hover: { deg: 1.2 },
      glide: { deg: -4, swayDeg: 1 },        // 滑翔：向前倾
      fold: { deg: 0.5 },
      headToLean: -0.6,      // 哈气“头后仰 −8° 再前推 +6°” → 整张图倾斜（负号：后仰 = 向后倒）
    },
    canvasPx: 1024,
    // 远→近；同一 index 的变体（眼睛/嘴）同一时间只显示一张
    standParts: [
      { name: 'wing_right', file: 'mochi_wing_right' },
      { name: 'wing_left', file: 'mochi_wing_left' },
      { name: 'tail', file: 'mochi_tail' },
      { name: 'body', file: 'mochi_body' },
      { name: 'belly', file: 'mochi_belly' },
      { name: 'head', file: 'mochi_head' },
      { name: 'eye_open', file: 'mochi_eye_open', parent: 'head', group: 'eye' },
      { name: 'eye_closed', file: 'mochi_eye_closed', parent: 'head', group: 'eye' },
      { name: 'eye_happy', file: 'mochi_eye_happy', parent: 'head', group: 'eye' },
      { name: 'mouth_closed', file: 'mochi_mouth_closed', parent: 'head', group: 'mouth' },
      { name: 'mouth_open', file: 'mochi_mouth_open', parent: 'head', group: 'mouth' },
      { name: 'mouth_smile', file: 'mochi_mouth_smile', parent: 'head', group: 'mouth' },
      { name: 'blush', file: 'mochi_blush', parent: 'head' },
    ],
    sleepParts: [
      { name: 'sleep_body', file: 'mochi_sleep_body' },
      { name: 'sleep_belly', file: 'mochi_sleep_belly' },
    ],
    layerGap: 0.001,          // 部件之间 z 间隔约 1 mm
    poseFadeSec: 0.3,
    // 缺图时占位部件画在画布的哪块区域 [cx, cy, w, h]（像素），让占位 Mochi 也能看出形状
    placeholderRects: {
      wing_right: [734, 560, 240, 180], wing_left: [290, 560, 240, 180],
      tail: [720, 830, 240, 110], body: [512, 650, 380, 360], belly: [512, 690, 220, 220],
      head: [512, 380, 380, 300],
      eye_open: [512, 360, 220, 60], eye_closed: [512, 365, 220, 30], eye_happy: [512, 355, 220, 46],
      mouth_closed: [512, 440, 90, 26], mouth_open: [512, 445, 110, 60], mouth_smile: [512, 440, 120, 34],
      blush: [512, 410, 300, 44],
      sleep_body: [512, 720, 640, 340], sleep_belly: [512, 740, 300, 180],
    },
    // pivots.json 没写某个锚点时的默认值（像素）
    defaultAnchors: { mouth: [512, 440], head_top: [512, 240], zzz: [640, 560] },

    sleepBreath: { amp: 0.06, period: 4 },     // 睡姿肚皮 y 缩放 1.0↔1.06，周期 4 秒
    idleBreath: { amp: 0.02, period: 3 },      // 等待时轻微呼吸起伏
    inhaleBelly: 1.08,                         // 吸气时肚皮 1.0→1.08
    wing: {
      upSign: { wing_left: -1, wing_right: 1 }, // 哪个旋转方向是“向上”（画布里左翅根在右侧）
      flapDeg: 25, flapHz: 3,                  // 飞行：±25°，约 3 Hz
      hoverDeg: 14, hoverHz: 1.6,              // 悬停：小幅扇动
      glideOpenDeg: 14, glideDeg: 4, glideHz: 0.8, // 滑翔：张开小幅摆动
      foldDeg: 0, foldWiggleDeg: 1.5, foldHz: 0.4,
    },
    tail: { flyDeg: 10, flyHz: 1.4, idleDeg: 3, idleHz: 0.5 },
    hover: { amp: 0.02, period: 1.6 },          // 悬停 ±2 cm
    blink: { minSec: 3, maxSec: 4, closedSec: 0.15 },
    huff: { backDeg: -8, forwardDeg: 6, backSec: 0.28, pushSec: 0.16, holdSec: 0.85, recoverSec: 0.3, headSign: 1 },
    hop: { height: 0.06, sec: 0.5 },
    spinSec: 0.9,                              // P1：开心转圈（纸片翻面）
    blushFadeSec: 0.4,
    faceFog: { mode: 'turn', maxDeg: 18, sec: 0.5 }, // HUFF 时朝雾转一点（'turn' | 'flip' | 'none'）
    artFacing: 1,                              // 'flip' 模式下：画面里 Mochi 朝右 = 1，朝左 = -1
    settleSec: 1.5, settleArc: 0.14,
    restDescendSec: 0.7,
    sneeze: { windupSec: 0.35, jerkSec: 0.12, recoverSec: 0.45, windupDeg: -6, jerkDeg: 10 },
  },

  orb: {
    coreSize: 0.1, glowSize: 0.34,
    color: '#ffe2a0', glowColor: '#ffc46b',
    farPos: [3.6, 3.0, -7.5],
    bobAmp: 0.025, bobPeriod: 3.2, glowBreathAmp: 0.1, glowBreathPeriod: 2.6,
    greet: { approachSec: 1.6, circleSec: 1.8, radius: 0.48, toRestSec: 0.8 },
    // 光团每次送星星按顺序换一种颜色（fx_star_01…06，由 tools/prep_stars.py 生成）；都没有时用 fx_star.png，再没有就代码画
    star: { flySec: 0.8, dropSec: 0.45, returnSec: 0.8, aboveHead: 0.22, size: 0.12,
      files: ['fx_star_01', 'fx_star_02', 'fx_star_03', 'fx_star_04', 'fx_star_05', 'fx_star_06'] },
    flash: { boost: 1.9, sec: 0.35 },
    snuggleOffset: [0.24, 0.04, 0.06], snuggleSec: 0.9, snuggleBoost: 1.45,
    endOffset: [0.26, 0.12, 0.05], endBoost: 1.6,
    trailRate: 40,          // 拖尾粒子每秒
  },

  band: {
    fadeSec: 0.8, opacity: 0.55, brightOpacity: 0.95, color: '#fff3c4',
    sparkleCount: 8,
  },

  flame: {
    // 'grow'：fx_flame_01→02→03 从小到大播一遍后停在 03（美术的三帧是火焰从小到大）；'loop'：三帧循环闪
    mode: 'grow',
    frameSec: 0.08, size: 0.2, travelSec: 0.75, demoDistance: 0.45, artAngleDeg: 0,
    embers: 18,
  },

  // 代码画的单个 Z：count/rise/sec/size；美术的整组 Zzz 图：groupCount/groupW(宽,米)/groupRise/groupSec
  zzz: { count: 3, rise: 0.28, sec: 3.0, size: 0.09, sway: 0.03, groupCount: 2, groupW: 0.2, groupRise: 0.16, groupSec: 3.6 },

  membrane: { // 旧的代码画保护膜（带涟漪）。美术把保护膜改成了保护壳（fx_shell_long / fx_shell_short，在 layout.json 里摆），所以关掉
    enabled: false, y: 2.35, center: [0, -1.8], radius: 3.2, opacity: 0.16,
  },

  timing: {
    wakeSec: 0.5,
    restBetweenBreathsSec: 0.8,
    huffDemoSec: 1.7,
    huffFlashLeadSec: 0.2,      // 光团亮一下之后 Mochi 才哈火
    huffStepSec: 1.9,           // 一次确认哈气的整段动画
    endCelebrateSec: 3.5,
  },

  audio: {
    ext: '.mp3',
    bgm: 'bgm_pad_loop', bgmVolume: 0.5, bgmEndVolume: 0.3,
    sfxVolume: 0.9,
    pauseMaster: 0.4,
    stepFadeOutSec: 0.2,        // 音效比模板秒数长时，在结束前 0.2 秒淡出
    names: ['bgm_pad_loop', 'sfx_snore', 'sfx_inhale_rise', 'sfx_hold', 'sfx_exhale_fall', 'sfx_huff',
      'sfx_melt_chime', 'sfx_star', 'sfx_round_complete', 'sfx_sneeze', 'sfx_pat_drum'],
    synthFallback: false,        // true = 缺音频时用 Web Audio 合成简单占位音（默认按任务书静默跳过）
  },

  input: {
    debounceMs: 300,
    // Quest 上 A/X 通常是索引 4，B/Y 是索引 5 —— 请在头显里看控制台打印的实际读数后再改
    right: { pause: 4, end: 5 },
    left: { restart: 4, sneeze: 5, autoplay: 1, recenter: 3 },
    restartHoldSec: 1, autoplayHoldSec: 1,
    nextHands: ['right'],        // 哪只手的扳机算“下一步”（可改成 ['right','left']）
    logButtons: true,
    keys: {
      Space: 'next', KeyP: 'pause', KeyE: 'end', KeyR: 'restart', KeyL: 'reloadLayout',
      KeyH: 'toggleHud', KeyC: 'sneeze', KeyB: 'percussion', KeyD: 'autoplay', KeyO: 'recenter',
    },
  },

  autoplay: { intervalSec: 2.2, huffIntervalSec: 2.6, startDelaySec: 3 },

  desktop: { fov: 70, maxYawDeg: 30, maxPitchDeg: 18, dragSensitivity: 0.15 },

  debug: { infoLogSec: 10, maxTextureSize: 2048 },
};
