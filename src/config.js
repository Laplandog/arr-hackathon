// 所有可调数值集中在这里（时长、角度、颜色、粒子数、文件名、按键索引）。
// 节奏参数（几口气、几秒）不在这里，在 public/config/template.json —— 示意，非临床参数。

export const CONFIG = {
  paths: {
    template: 'config/template.json',
    layout: 'assets/layout.json',
    voice: 'config/voice.json',
    pivots: 'assets/mochi/mochi_pivots.json',
    poses: 'assets/mochi/mochi_poses.json',
    bg: 'assets/bg/',
    fog: 'assets/fog/',
    mochi: 'assets/mochi/',
    fx: 'assets/fx/',
    orb: 'assets/orb/',
    egg: 'assets/egg/',
    audio: 'assets/audio/',
  },

  // template.json 读不到时的兜底（示意，非临床参数）
  templateDefaults: {
    rounds: 2, expansionBreaths: 3, inhaleSec: 3, holdSec: 2, exhaleSec: 3,
    huffs: 2, includeCough: false, includePercussion: false, tutorial: true,
  },

  // 新手引导「Mochi 醒来的第一天」（src/tutorial.js）。模板里 "tutorial": false 就跳过（第二次以后玩）。
  tutorial: {
    hintAt: [7, 15, 23],      // 每段开始后第几秒念第 1/2/3 句提示（孩子先做到了就不念）
    autoAt: 36,               // 到这个时间还没做，世界自己慢慢完成，照样往下走
    gazeDeg: 14,              // 视线和目标夹角小于这个度数 = 在看它
    wakeGazeSec: 2.5,         // 看着 Mochi 累计这么久，它就醒
    stillDegPerSec: 7,        // 转头角速度低于这个 = 安静
    echoSec: 0.9, echoTiltDeg: 20, // 你动我也动：孩子做完一个动作后 Mochi 学一遍（保持多久、歪多少度）
    swaySec: 1.6, nodSec: 1.1,     // 第 1 句提示前 Mochi 左右摇摆多久；“点点头”那句之后点两下头多久
    fireflyApproachSec: 8,    // 一直安静的话，萤火虫飞到面前要几秒
    fireflyRest: [0.16, 0.82, -0.72], // 萤火虫最后停在孩子面前的位置
    // 吸-停-呼：一群萤火虫在孩子面前（离脸 swarmDist 米、比眼睛低 swarmDown 米、散开范围 swarmSpread）；停一下时水滴从 Mochi 头顶上方 dropFall 米落下
    swarmCount: 6, swarmDist: 0.55, swarmDown: 0.12, swarmSpread: [0.2, 0.1, 0.08], dropFall: 1.3,
    swarmArriveSec: 3.2,      // 萤火虫飞过来聚好之后（不等孩子/家长操作）直接托起 Mochi
    breathSec: 0.7,           // 孩子的热气飞到 Mochi 嘴里用多久
  },

  // 旁白（只用英文）：台词在 public/config/voice.json；录音 assets/audio/vo_en_{键}.m4a（或 .mp3），缺了才用浏览器英文语音合成
  voice: {
    volume: 1, ttsRate: 0.9, ttsPitch: 1.1,
    targetRms: 0.12, maxGain: 5, maxPeak: 0.9,     // 录音按响度拉平（不破音）
    trimThreshold: 0.025, preRollSec: 0.1, tailSec: 0.25, // 剪掉前后空白：门槛很低，轻声的“嘘”也保留；前后各留一点
    duck: 0.45,                                    // 旁白说话时背景音乐压到 45%
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
    singleExts: ['.png', '.PNG', '.png.png', '.png.PNG'], // Windows 隐藏扩展名时容易导出成 xxx.png.png
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
    // spanDeg 270：镜像接缝在左右 135° 附近（身后两侧），孩子转头看两侧时看不到天空的“折痕”
    dome: { radius: 80, elevation: [-45, 60], spanDeg: 270, fadeDeg: 15 },
    // 自动裁掉四周透明边（只改 UV，不动文件）。内容面积小于整张的 85% 才裁。layout.json 的 w = 看得见的内容宽度
    trim: { enabled: true, scanPx: 512, margin: 0.005, maxAreaToTrim: 0.85 },
  },

  // 全局哈气计数 → 区域。layout.json 里写 "zones" 可以覆盖。
  // 颜色从远到近、从中间往两侧扩散：远景一圈 → 左边 → 右边（风车转起来）→ 主岛和孩子脚下
  zones: [
    { fog: 'fog_puff_01', layers: ['bg_10_far_islands', 'bg_33_island_side_l2', 'bg_35_island_side_r2'] }, // z1 远景岛 + 两侧远处的小岛
    { fog: 'fog_puff_02', layers: ['bg_30_island_left', 'bg_32_island_side_l1', 'bg_23_cloudbank_side_l'] }, // z2 左岛 + 左侧
    { fog: 'fog_puff_03', layers: ['bg_31_island_right', 'bg_34_island_side_r1', 'bg_50_windmill_body', 'bg_51_windmill_blades',
      'bg_24_cloudbank_side_r'] },                                                                          // z3 右岛 + 右侧风车岛
    { fog: 'fog_puff_04', layers: ['bg_40_island_main', 'bg_41_flowers', 'bg_41_flowers_small', 'bg_41_flowers_big',
      'bg_42_nest_back', 'bg_42_nest_front', 'bg_60_fg_grass_left', 'bg_60_fg_grass_right',
      'bg_61_grass_01', 'bg_61_grass_02', 'bg_61_grass_03', 'bg_61_grass_04', 'bg_05_ground'] }, // z4 主岛花丛 + 小窝 + 前景草 + 脚下的地面
  ],

  world: {
    bgGray: '#a29db0',      // 雾天背景色（天空图后面）
    bgClear: '#c6b9d3',     // 放晴后的背景色（接近天空图顶部的淡紫，边缘不露色）
    endBrightness: 1.08,    // END 时整体亮度略升
    // 空气透视：离孩子 near 米以内不变，越远越往天空地平线的颜色混，far 米处混到 max
    haze: { near: 3.5, far: 24, max: 0.45 },
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
        cold: 'mochi_pose_cold', // 可选：冷得发抖的表情（新手引导“哈一哈”用；没有就用 idle + 冰蓝色）
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
    farPos: [6.5, 4.5, -14],
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
    // 'grow'：fx_flame_01→02→03 播一遍后停在 03，同时火苗从小放大；'loop'：三帧循环闪
    // upright：美术的火苗是竖直的（火尖朝上）→ 保持朝上，只往运动的反方向倾斜（像被风吹着飞），最多 maxLeanDeg 度
    // upright = false 时按 artAngleDeg 整个转向飞行方向（0 = 美术图火尖朝右）
    mode: 'grow', upright: true, maxLeanDeg: 35,
    frameSec: 0.08, size: 0.2, travelSec: 0.75, demoDistance: 0.45, artAngleDeg: 0,
    embers: 18,
  },

  // 代码画的单个 Z：count/rise/sec/size；美术的整组 Zzz 图：groupCount/groupW(宽,米)/groupRise/groupSec
  // 美术的几何纸片（fx_confetti_01…06：圆、菱形、四角星、方块、月牙、三角）
  paper: {
    files: ['fx_confetti_01', 'fx_confetti_02', 'fx_confetti_03', 'fx_confetti_04', 'fx_confetti_05', 'fx_confetti_06'],
    bandStar: 'fx_confetti_03', bandStars: 4, bandStarSize: 0.07, // 吸满悬停时舒适带里闪几颗四角星
    confettiCount: 36, confettiSpreadSec: 2.5, confettiSize: 0.06,  // 结局放晴时飘落的纸屑
  },

  zzz: { count: 3, rise: 0.28, sec: 3.0, size: 0.09, sway: 0.03, groupCount: 2, groupW: 0.2, groupRise: 0.16, groupSec: 3.6 },

  // 龙蛋（P1）：放在小窝里 Mochi 右边。位置/大小在 layout.json 的 "egg" 里调（pos = 蛋底中点，h = 蛋高，米）。
  // 每完成一轮暖一格；格数按模板轮数平均分配，最后一轮完成时正好出现裂纹，END 时孵化。
  egg: {
    files: { cold: 'egg_cold', warm: 'egg_warm', crack: 'egg_crack', top: 'egg_shell_top', bottom: 'egg_shell_bottom' },
    pos: [0.35, 0.72, -2.35], h: 0.31,
    stageNames: ['冰凉', '微暖发光', '轻轻晃动', '出现裂纹', '孵化'],
    stageFadeSec: 1.2,
    crackFromTop: 0.47,            // 裂缝在图里的高度（从上往下 0–1），上半壳绕这里转
    glow: { color: '#ffb35c', size: 2.1, byStage: [0, 0.4, 0.5, 0.7, 0.9], pulseSec: 2.6, pulseAmp: 0.25 },
    inner: { color: '#ffe3a0', size: 1.1 },
    wobble: { deg: [0, 0, 5, 8], everySec: [0, 0, 3.6, 2.4], sec: 0.9 },
    beam: { color: '#ffd98a', height: 1.6, width: 0.32, opacity: 0.55, inSec: 0.5, holdSec: 1.0, outSec: 0.9 },
    hatch: { shakeSec: 1.4, shakeDeg: 11, shakes: 6, popSec: 0.9, popUp: 0.24, landX: 0.2, landY: -0.08, restDeg: -40 },
    orbOffset: [0.2, 0.12, 0.08],  // 孵化时光团在蛋的右上方（y 相对蛋顶）
  },

  // 星座（P1）：天上一圈蛋形的星位，总星数 = 轮数 × 每轮深呼吸次数。位置在 layout.json 的 "constellation" 里调。
  constellation: {
    // 放在左上方的天空：不会被飞起来的 Mochi 挡住，光点从 Mochi 头顶斜着飞上去也看得清
    center: [-4.4, 6.8, -11.5], w: 2.6, h: 3.5,
    taper: 0.2, jitter: 0.03,    // 蛋形上窄下宽；星位略微错开一点，像真的星座
    slotSize: 0.6, slotOpacity: 0.9, slotColor: '#a99ad6', // 还没亮的星：灰紫色小纸星
    litSize: 0.75, haloScale: 2.2, haloColor: '#ffd98a',
    lineColor: '#ffe39a', lineWidth: 0.09, lineOpacity: 0.9, lineSec: 0.7, lineSegments: 6,
    fillColor: '#ffd9a0', fillOpacity: 0.32, fillScale: 1.3,
    sparkSec: 1.2, cometSec: 1.3, sparkArc: 0.5, sparkAngular: 0.05, sparkColor: '#ffc95c', trailRate: 45,
  },

  // 小动静（P1）：纸鸟、蝴蝶、飘浮的种子，都跟着进度出现。enabled = false 整个关掉。
  // 纸鸟：zone = 第几个区域恢复颜色时从 from 那座岛飞起来（'end' = 结尾放晴时从远处飞来）；
  //       之后在方位角 az[0]..az[1]（度，左负右正）、离孩子 r 米、仰角 el[0]±el[1] 度之间来回飞，periodSec 秒一个来回
  ambient: {
    enabled: true,
    birdTakeoff: { sec: 3.2, arc: 1.2, fadeSec: 0.5 },
    flapHz: 2.6, flapRun: 1.4, glideSec: 1.8,   // 扇 1.4 秒、滑翔 1.8 秒
    birds: [
      { zone: 0, from: 'bg_33_island_side_l2', az: [-100, -62], r: 12, el: [11, 2], periodSec: 30, size: 1.0, tint: '#dbe9f7' },
      { zone: 1, from: 'bg_32_island_side_l1', az: [-78, -36], r: 8.5, el: [12, 2.5], periodSec: 24, size: 0.8, tint: '#ffffff' },
      { zone: 1, from: 'bg_32_island_side_l1', az: [-70, -42], r: 9.5, el: [17, 2], periodSec: 28, size: 0.74, tint: '#fde3cf', delay: 2.2 },
      { zone: 2, from: 'bg_34_island_side_r1', az: [34, 80], r: 8.5, el: [14, 2.5], periodSec: 25, size: 0.8, tint: '#ffffff' },
      { zone: 2, from: 'bg_34_island_side_r1', az: [44, 74], r: 10, el: [19, 2], periodSec: 30, size: 0.74, tint: '#dff1e8', delay: 2.0 },
      { zone: 'end', from: null, az: [8, 46], r: 15, el: [24, 2], periodSec: 34, size: 1.25, tint: '#fff2e0' },
    ],
    // 蝴蝶：第 4 个区域（主岛）恢复、花开以后，从 at 那丛花里飞出来，绕着花丛画 8 字
    butterflyFlapHz: 4,
    butterflies: [
      { zone: 3, at: 'bg_41_flowers_big', tex: 0, size: 0.2, rx: 0.36, ry: 0.12, rz: 0.12, lift: 0.32, periodSec: 7, delay: 1.8 },
      { zone: 3, at: 'bg_41_flowers_small', tex: 1, size: 0.18, rx: 0.26, ry: 0.1, rz: 0.1, lift: 0.28, periodSec: 6, delay: 2.6 },
    ],
    // 种子：孩子身边 rMin..rMax 米、方位角 az 范围里慢慢往上飘；开场只出现 grayCount 颗、灰色，越往后越多、越暖
    seeds: {
      count: 40, grayCount: 14, rMin: 1.3, rMax: 2.6, az: [-110, 110], yMin: 0.25, yMax: 2.6,
      rise: [0.025, 0.06], sway: 0.08, size: [0.055, 0.085], grayColor: '#d3cddf', warmColor: '#fff4d6',
    },
  },

  membrane: { // 旧的代码画保护膜（带涟漪）。美术把保护膜改成了保护壳（fx_shell_long / fx_shell_short，在 layout.json 里摆），所以关掉
    enabled: false, y: 2.35, center: [0, -1.8], radius: 3.2, opacity: 0.16,
  },

  timing: {
    wakeSec: 0.5,
    restBetweenBreathsSec: 0.8,
    huffDemoSec: 1.7,
    huffFlashLeadSec: 0.2,      // 光团亮一下之后 Mochi 才哈火
    childBreathSec: 0.7,        // 哈气确认后先从孩子嘴前飞一团热气进 Mochi 嘴里，再喷火（让孩子看见“我的气 → Mochi 的火”）
    huffStepSec: 1.9,           // 一次确认哈气的整段动画
    endCelebrateSec: 3.5,       // （全部完成时还要加上星光落下 + 龙蛋孵化的时间）
  },

  audio: {
    ext: '.mp3',
    // 背景音乐按阶段切换：开场/引导前半 intro（瞌睡）· 萤火虫托起和飞行 fly · 其余练习 main（绘本摇篮曲）· 结尾放晴 end
    bgmTracks: { intro: 'bgm_intro', main: 'bgm_main', fly: 'bgm_fly', end: 'bgm_end' },
    bgmVolume: 0.55, bgmEndVolume: 0.3,
    bgmFadeSec: 4,              // 换曲子时等功率交叉淡化几秒（新的渐强、旧的渐弱）
    bgmLoopXfSec: 4,            // 一首放到尾巴之前，交叉淡入接回开头用几秒（最多是曲长的 30%）
    bgmTargetRms: 0.12,         // 各首按实测响度拉到差不多大
    // 音效：每个文件自动剪掉前后空白、按响度拉平到 sfxTargetRms（比旁白、背景音乐都小，不会太大声）；sfxLevel 单独再调
    sfxVolume: 0.8, sfxTargetRms: 0.07,
    // 呼气声大一点；孩子 / Mochi 的哈气（用呼气声的前 1.4 秒）单独调，比呼气小一些
    sfxLevel: { sfx_snore: 0.6, sfx_drop: 1.1, sfx_revive: 0.9, sfx_exhale_fall: 1.9, sfx_huff: 1.2 },
    // 同一个音效用在几个地方：融雾恢复颜色、龙蛋变暖、孵化、Mochi 暖回来都用“复生”；孩子哈气用呼气声的前一段
    alias: { sfx_melt_chime: 'sfx_revive', sfx_egg_warm: 'sfx_revive', sfx_hatch: 'sfx_revive', sfx_huff: 'sfx_exhale_fall' },
    huffSoundSec: 1.4,          // 哈气声只放前 1.4 秒（短促的“哈——”）
    pauseMaster: 0.4,
    stepFadeOutSec: 0.2,        // 音效比模板秒数长时，在结束前 0.2 秒淡出
    synthFor: ['sfx_cough'],    // 这些音效万一文件加载失败就用代码合成（其他缺了就静默）；咳嗽现在有录音 sfx_cough.mp3（原录音的前 1 秒，两声“咳、咳”）
    names: ['sfx_snore', 'sfx_inhale_rise', 'sfx_hold', 'sfx_exhale_fall', 'sfx_drop', 'sfx_revive', 'sfx_cough',
      'sfx_star', 'sfx_round_complete', 'sfx_sneeze', 'sfx_pat_drum', 'sfx_constellation'],
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
      KeyT: 'hint', KeyS: 'skipTutorial',
    },
  },

  autoplay: { intervalSec: 2.2, huffIntervalSec: 2.6, startDelaySec: 3 },

  desktop: {
    fov: 70, maxYawDeg: 120, maxPitchDeg: 45, dragSensitivity: 0.15, // 四周都有东西了，桌面上拖动也能看两侧、身后和脚下
    // 桌面视差（VR 里不用，头显本身有立体和视差）：鼠标移动最多平移 x/y 米；鼠标停 idleAfterSec 秒后左右缓慢晃 sway 米
    parallax: { x: 0.2, y: 0.08, sway: 0.08, swaySec: 9, idleAfterSec: 3 },
  },

  debug: { infoLogSec: 10, maxTextureSize: 2048 },

  fxScale: 1, // 运行时设置：Mochi 实际高度 / mochi.designHeight
};

// Mochi 身边的特效尺寸（米）是按 Mochi 高 0.6 m 设计的；场景推远、Mochi 变大时一起等比放大，看起来大小不变
CONFIG.mochi.designHeight = 0.6;
const NEAR_FX = [
  ['orb', 'coreSize'], ['orb', 'glowSize'], ['orb', 'bobAmp'], ['orb', 'greet', 'radius'],
  ['orb', 'star', 'aboveHead'], ['orb', 'star', 'size'], ['orb', 'snuggleOffset'], ['orb', 'endOffset'],
  ['flame', 'size'], ['flame', 'demoDistance'],
  ['zzz', 'size'], ['zzz', 'rise'], ['zzz', 'sway'], ['zzz', 'groupW'], ['zzz', 'groupRise'],
  ['mochi', 'hover', 'amp'], ['mochi', 'hop', 'height'], ['mochi', 'settleArc'],
];
let nearFxBase = null;
export function scaleNearFx(mochiHeight) {
  const k = mochiHeight / CONFIG.mochi.designHeight;
  const get = (p) => p.reduce((o, key) => o[key], CONFIG);
  const set = (p, v) => { p.slice(0, -1).reduce((o, key) => o[key], CONFIG)[p[p.length - 1]] = v; };
  if (!nearFxBase) nearFxBase = NEAR_FX.map((p) => structuredClone(get(p)));
  NEAR_FX.forEach((p, i) => { const b = nearFxBase[i]; set(p, Array.isArray(b) ? b.map((v) => v * k) : b * k); });
  CONFIG.fxScale = k;
  return k;
}
