# Mochi 呼吸大冒险 · VR Demo（A 线）

Three.js + WebXR 的“立体书”式 VR 场景，能在 Quest 3 浏览器里运行。孩子坐着看 Mochi 演示一轮 ACBT 呼吸；旁边扮演家长的人用右手柄推进阶段，每次操作在画面里变成光团小精灵的动作。

> 节奏参数（`public/config/template.json`）为示意，非临床参数。

**线上预览：https://laplandog.github.io/arr-hackathon/** （电脑浏览器直接看；Quest 浏览器打开同一个网址点 ENTER VR）

## 美术：上传图片看效果

1. 打开仓库 https://github.com/Laplandog/arr-hackathon ，进入对应文件夹，例如 `public/assets/bg/`
2. 点右上角 **Add file → Upload files**，把图片拖进去（**文件名必须和下面清单完全一致**，同名文件会直接覆盖）
3. 页面底部点 **Commit changes**
4. 等 1–2 分钟（仓库首页 **Actions** 标签里出现绿色对勾就是好了），刷新线上预览网址就能看到新图

- 还没上传的图会显示成带文件名的半透明占位方块，所以上传一张就能看到一张。
- **Mochi 姿势图例外**：美术给的整张姿势图要先用 `tools/prep_poses.py` 处理（去掉零散装饰、统一大小、脚底对齐），再上传生成的 `public/assets/mochi/mochi_pose_*.png` 和 `mochi_poses.json`。见下面“Mochi 整图姿势”。
- 调位置：改 `public/assets/layout.json`（网页上点文件 → 右上角铅笔图标编辑 → Commit changes）。`pos` 是看得见的内容的中心，`w` 是看得见的内容的宽：图片四周的透明边程序会自动裁掉，画布大小不影响位置。
- 新起名字的层（例如 `bg_60_fg_grass_left`）要在 `layout.json` 里加一行才会出现；加 `"grayStart": true` 表示开场也是灰的（属于某个区域就随区域恢复，否则结局放晴时恢复）。
- 扩展名大小写都可以（`.png` / `.PNG`）。
- 电脑浏览器里看效果时按 **Space** 推进流程、**D** 自动播放整轮，其他按键见下表。左上角面板显示还缺几张图，按 F12 打开控制台能看到完整缺失清单。

## 运行

```bash
npm install
npm run dev        # HTTPS，Quest 用
npm run dev:http   # 纯 HTTP，只在电脑浏览器调试
npm run build      # 输出 dist/（Vercel / Netlify 直接用）
```

**Quest 3：** 电脑和 Quest 连同一个 Wi-Fi → Quest 浏览器打开终端里显示的 `https://<电脑IP>:5173` → 证书警告选“继续” → 点 **ENTER VR**。WebXR 必须是 HTTPS。如果本机 HTTPS 不通，就部署到 Vercel 用线上网址测。

**一个人录头显画面：** 打开 `https://…/?autoplay=1`，进 VR 后 3 秒自动开始，按固定间隔模拟“下一步/确认哈气”跑完整轮。

## 按键

| 动作 | Quest 手柄 | 键盘 |
| --- | --- | --- |
| 下一步 / 确认哈气 | 右扳机（select） | Space |
| 暂停 / 继续 | 右手 A | P |
| 结束（温和收尾，保留进度） | 右手 B | E |
| 重新开始 | 左手 X 长按 1 秒 | R |
| 重读 layout.json（仅桌面） | — | L |
| 喷嚏（P1，需 `includeCough: true`） | 左手 Y | C |
| 拍背鼓点（P1，需 `includePercussion: true`） | — | B |
| 录制自动播放（P1） | 左手 grip 长按 1 秒 | D |
| 重新居中（P1） | 左摇杆按下 | O |
| 隐藏调试面板 | — | H |

所有按键 300 ms 防抖。**A/B/X/Y 的索引（默认 A/X=4，B/Y=5）需要在头显里实测**：控制台会打印每个按钮的“手 + 索引 + 按下/松开”，不对就改 `src/config.js` → `input`。

## 流程

`INTRO → SLEEP → [ FLY → HUFF → SETTLE ] × rounds → END`，另有全局 PAUSE。

- **INTRO**：全灰，4 团雾就位，Mochi 在窝里睡。按下一步 → 光团从远处飞来绕 Mochi 一圈 → SLEEP
- **SLEEP**：打呼噜（不要求跟拍）。下一步 → 光团送星星 → Mochi 醒来 → FLY
- **FLY**：舒适带淡入，自动循环 `expansionBreaths` 次（吸气上升 → 悬停 → 滑翔落下）。循环没完成时按键无效；完成后下一步 → 送星星 → HUFF
- **HUFF**：Mochi 先示范一次（不融雾）。每按一次 = 家长确认孩子哈了一次气：光团亮一下 → Mochi 哈火 → 下一团雾融化 → 0.4 秒后区域灰→彩。全局哈气 1–4 依次对应 z1 远景岛、z2 左岛、z3 右岛、z4 主岛花丛。本轮哈满后再按一次 → SETTLE
- **SETTLE**：飞回小窝打呼噜。还有轮次 → 送星星 → FLY；否则 → END
- **END**：天空放晴、亮度略升、残雾淡出，Mochi 开心转圈，光团在它身边发暖光
- **PAUSE**：光团靠着 Mochi，Mochi 落地趴下，音量 40%，计时冻结，不弹任何界面。继续时重做当前这口呼吸
- **结束键**：随时可用；Mochi 飞回窝，已恢复的颜色保留，天空不强行放晴

没有失败、没有分数、没有 Miss；进度不会倒退。确认哈气在按下时就记下，所以中途暂停，雾也照样融化。

## Mochi 整图姿势（当前使用）

美术交的是整张姿势图，不是拆件，所以 Mochi 用“整图姿势模式”：按状态切换姿势，飞行/呼吸/哈气靠整张图的位移、拉伸、倾斜表现；哈气时纸片翻面朝向要融化的那团雾。

| 姿势文件 | 什么时候出现 |
| --- | --- |
| `mochi_pose_sleep.png` | 开场、放松呼吸、回窝打呼噜 |
| `mochi_pose_idle.png` | 起飞、呼气滑翔、等待家长确认 |
| `mochi_pose_happy.png` | 吸满悬停、本轮哈气完成、END 开心转圈 |
| `mochi_pose_huff.png` | 每次哈火 |
| `mochi_pose_sneeze.png` | 喷嚏（需 `includeCough: true`） |
| `mochi_pose_rest.png` | 暂停时趴下休息 |
| `mochi_pose_dizzy.png` | 预留：将来碰到保护膜晕乎乎（P2） |

美术更新姿势图时，在项目根目录运行（需要 Python + Pillow + numpy + scipy）：

```bash
python tools/prep_poses.py idle=站立.webp sleep=睡觉.webp rest=趴下.webp happy=开心.webp huff=哈气.webp sneeze=喷嚏.webp dizzy=晕.webp
```

脚本会去掉旁边零散的 Zzz/气团/闪光线（这些由代码做动画），把站立姿势统一到同一身高、脚底对齐，并写出 `mochi_poses.json`（火苗出口、星星落点、Zzz 起点的位置也在里面）。删掉 `mochi_poses.json` 或缺 idle/sleep 两张图时，自动退回下面的拆件模式。

## 素材（B 交图：覆盖同名文件即可，代码不用改）

缺图时自动画**带文件名的半透明彩色占位矩形**；光团、星星、火苗、Zzz、舒适带缺图时用代码生成。控制台会列出完整缺失清单，调试面板也会显示缺失数量。

```
public/assets/
  layout.json                      各层位置（单位米；B 调位置后桌面按 L 重读）
  bg/  {键}_color.png + {键}_gray.png   ← bg_00_sky（也可 .jpg）, bg_10_far_islands, bg_30_island_left, bg_31_island_right, bg_40_island_main
       bg_41_flowers_closed.png + bg_41_flowers_open.png
       其他 bg 键 → {键}.png（layout 里 "optional": true 的层，文件不存在就不显示）
  fog/ fog_puff_01.png … fog_puff_04.png
  mochi/ mochi_pivots.json         支点像素坐标（1024 画布，左上角原点，y 向下）
         mochi_wing_left / wing_right / tail / body / belly / head
         mochi_eye_open / eye_closed / eye_happy
         mochi_mouth_closed / mouth_open / mouth_smile / mochi_blush
         mochi_sleep_body / mochi_sleep_belly        （全部 1024×1024，原位对齐）
  fx/  fx_zzz, fx_flame_01..03, fx_comfort_band
       fx_star_01..06   光团每次送星星按顺序换一种颜色（都没有时用 fx_star.png，再没有就代码画）
                        美术给不透明的浅色底星星图时：python tools/prep_stars.py 黄星星.png 紫星星.png
                        → 自动抠图并调色出 黄/紫/陶土橙/青石绿/粉/天蓝 6 张
  orb/ orb_core, orb_glow
  audio/ bgm_pad_loop, sfx_snore, sfx_inhale_rise, sfx_hold, sfx_exhale_fall, sfx_huff,
         sfx_melt_chime, sfx_star, sfx_round_complete, sfx_sneeze, sfx_pat_drum   （.mp3）
```

- 没有 `_gray` 时，shader 会把彩色图实时去饱和并偏灰紫，所以 B 可以不做灰版。
- **待和《素材清单》核对的文件名：** 眼睛/嘴的变体名、`mochi_blush`、`sfx_sneeze`、`sfx_pat_drum`。如果清单写法不同，改 `src/config.js` 里的 `mochi.standParts` / `audio.names`，或者直接按这里的名字导出。
- `mochi_pivots.json` 除了各部件支点，还可以写 `mouth`（火苗出口）、`head_top`（星星落点）、`zzz`（Zzz 起点）三个锚点。
- 单张贴图超过 2048 会在控制台警告。素材 URL 带 `?v=` 构建版本号，避免 Quest 缓存旧图。
- 默认不播放合成占位音（按任务书：缺音频静默跳过）。想先听节奏，就把 `src/config.js` → `audio.synthFallback` 改成 `true`。

## 文件

```
src/config.js        所有可调数值（时长、角度、颜色、粒子数、文件名、按键索引）
src/main.js          renderer、XR、主循环、自动播放、重新居中
src/assets.js        贴图/JSON 加载、占位图、缺失清单
src/layout.js        读 layout.json 摆层；灰↔彩材质
src/mochi.js         剪纸动画（支点、姿势淡入淡出、翅膀/尾巴/肚皮/头）
src/effects.js       光团、送星、雾融化、区域恢复、舒适带、火苗、Zzz、天空放晴、保护膜
src/audio.js         铺底循环 + 各段音效（吸/停/呼音效按模板秒数截断，最后 0.2 秒淡出）
src/stateMachine.js  状态机（只读 template.json）
src/input.js         手柄 + 键盘
src/hud.js           桌面调试面板
```

调试：控制台里 `mochiDemo.sm.next()`、`mochiDemo.advance(秒)`（页面在后台时手动推进）。

## 部署（GitHub Pages）

`.github/workflows/deploy.yml`：每次 push 到 `main`（包括在 GitHub 网页上传素材）都会自动构建并发布到 https://laplandog.github.io/arr-hackathon/ ，约 1–2 分钟。构建时会输出 `version.json`，页面启动时不走缓存读取它，所以重新部署后刷新就能看到新图。
