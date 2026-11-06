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
| 下一步 / 确认哈气 / 新手引导里“孩子做到了” | 右扳机（select） | Space |
| 新手引导：提示再进一级（代替家长开口教） | — | T |
| 跳过新手引导 | — | S |
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

`INTRO → TUTORIAL → SLEEP → [ FLY → HUFF → SETTLE ] × rounds → END`，另有全局 PAUSE。

- **INTRO**：全灰，4 团雾就位，Mochi 在窝里睡。按下一步 → 光团从远处飞来绕 Mochi 一圈 → TUTORIAL（模板 `"tutorial": false` 时直接 SLEEP）
- **TUTORIAL 新手引导「Mochi 醒来的第一天」**：见下一节
- **HUFF 里孩子的气**：每次确认哈气，先从孩子嘴前飞出一团热气进 Mochi 嘴里，Mochi 再喷火——孩子看得见“我的气 → Mochi 的火 → 雾散了”
- **SLEEP**：打呼噜（不要求跟拍）。下一步 → 光团送星星 → Mochi 醒来 → FLY
- **FLY**：舒适带淡入，自动循环 `expansionBreaths` 次（吸气上升 → 悬停 → 滑翔落下）。每口气吸满停一下时，从 Mochi 头顶飞起一个金色光点，点亮左上方天空里的一颗星。循环没完成时按键无效；完成后下一步 → 送星星 → HUFF
- **HUFF**：Mochi 先示范一次（不融雾）。每按一次 = 家长确认孩子哈了一次气：光团亮一下 → Mochi 哈火 → 下一团雾融化 → 0.4 秒后区域灰→彩。全局哈气 1–4 依次对应 z1 远景岛（+ 两侧远处的小岛）、z2 左岛（+ 左侧小岛）、z3 右岛（+ 右侧风车岛，风车开始转）、z4 主岛花丛（+ 孩子脚下的地面）——颜色从远到近、从中间往两侧扩散。本轮哈满后再按一次 → SETTLE
- **SETTLE**：飞回小窝打呼噜，一道星光从天上落到龙蛋上，蛋暖一格。还有轮次 → 送星星 → FLY；否则 → END
- **END**：天空放晴、亮度略升、残雾淡出；星光落到龙蛋上，光团飞到蛋旁边，蛋使劲晃几下后裂开（上半壳飞起落到窝边，壳里透出暖光，孵出什么先留悬念），Mochi 开心转圈

### 新手引导「Mochi 醒来的第一天」（孩子自己摸索玩法）

规则：**孩子带头，Mochi 学孩子**。Mochi 从不先示范动作，只表现“它怎么了”（困、冷、够不着云）。讲故事的人（旁白，第三人称）只在孩子没反应时才开口：每一段先安静等几秒 → 第 1 句说 Mochi 怎么了 → 第 2 句给线索 → 第 3 句才说怎么帮。孩子自己做到了，后面的句子就不会播；一直没做也没关系，最后世界自己慢慢完成，照样往下走。

| 段 | Mochi 怎么了 | 孩子做什么 | 怎么判断 | 结果 |
| --- | --- | --- | --- | --- |
| 看一看 | 在窝里睡觉 | 看着它 | 头显朝向（自动） | 看着雾团雾会打小哈欠；看着 Mochi 它慢慢醒来 |
| 你动我也动 | 学孩子 | 歪头、转头、抬头 | 头显（自动） | Mochi 像照镜子一样跟着动 |
| 一起放松 | 打哈欠、困了 | 安静下来 | 转头速度（自动） | 萤火虫慢慢靠近，一动就退后一点，最后停在面前 |
| 吸一吸 | 想飞到云上，够不着；一群萤火虫在孩子面前飞，时不时往脸前凑 | 吸一口气 | 家长 Space | 萤火虫被“请”到脸前，再飞到 Mochi 身下把它托起来；停一下时一颗水滴从天上慢慢落到 Mochi 头上；呼气时降落，水滴滑进窝里 |
| 哈一哈 | 冻成冰蓝色渐变、发抖、身边有发抖符号和小雪花，嘴里冒冷气 | 哈一口气 | 家长 Space | 热气从孩子嘴前飞进 Mochi 嘴里，颜色慢慢变回来，身上一圈暖光，火苗变大 |
| 咳一咳（模板 `includeCough` 时） | 种子卡在喉咙里，难受的表情（dizzy 姿势） | 咳一下 | 家长 Space | 种子飞走；只请一次，不加码 |
| 龙蛋好冰 | 看看冰凉的蛋，再看看孩子 | — | — | 进入正式练习 |

- 家长：看到孩子做了按 **Space**；孩子没明白按 **T**（让游戏再提示一级，代替家长开口教）；**S** 跳过引导；**P** 暂停后继续会从这一段重新开始。
- 台词表：`public/config/voice.json`（团队改台词不用动代码）。录好的音频放 `assets/audio/vo_{键}.mp3`（例如 `vo_huff_1.mp3`）；没有音频时浏览器用中文语音合成念，再没有就只在家长面板上显示字幕。头显浏览器能不能语音合成要实测，最好录音。
- 时间、距离等数值：`src/config.js` → `tutorial`。萤火虫、水滴、热气、发抖符号、小雪花都是代码画的。
- Mochi 冷的时候：整张姿势图换成冰蓝色渐变（shader 里的 `uCold`），不需要额外的图；美术如果画一张冷得缩成一团的姿势 `mochi/mochi_pose_cold.png`（和其他姿势同一画布，跑一下 `tools/prep_poses.py`），“哈一哈”时会自动换上。

### 龙蛋 + 星座（长期目标）

- **星座**：左上方天空有一圈灰紫色的星位，总数 = `rounds × expansionBreaths`（默认 2 × 3 = 6）。每口深吸气点亮一颗，相邻的星用金线沿弧线连起来；全部点亮后闭合成一颗蛋的形状并发光。
- **龙蛋**：在小窝里 Mochi 右边。冰凉 → 微暖发光 → 轻轻晃动 → 出现裂纹 → 孵化。每完成一轮暖一格，格数按模板轮数平均分配，最后一轮完成时正好出现裂纹，END 时孵化。
- 只看“完成了阶段”，不看吸多深、哈多用力；暂停后重做同一口气不会多点一颗星；提前结束（E）保留已亮的星和蛋的温度，不孵化；只有重新开始（R）才回到初始。
- 位置和大小在 `layout.json` 的 `"egg"`（`pos` = 蛋底中点，`h` = 蛋高）和 `"constellation"`（`center`、`w`、`h`）里调；其他数值在 `src/config.js` → `egg` / `constellation`。

### 小动静（跟着进度出现）

- **纸鸟**：哪一边恢复颜色，就有鸟从那边的小岛飞起来，之后在那一侧的天上慢慢来回飞（扇几下翅膀、滑翔一会儿，往哪边飞就朝哪边）。第 1 次哈气 1 只（左侧远处）、第 2 次 2 只（左边）、第 3 次 2 只（右边风车岛），结尾放晴时再从远处飞来 1 只。
- **蝴蝶**：第 4 次哈气、主岛的花开了以后，一粉一黄两只蝴蝶从花丛里飞出来，绕着花丛画 8 字。
- **种子**：孩子身边 1.3–2.6 米一直有蒲公英种子慢慢往上飘。开场只有十几颗、灰色（像瞌睡的灰尘），越往后越多、越暖。
- 都很小、很慢、离得不近，没有大面积运动（防晕）。`src/config.js` → `ambient` 里调数量/大小/路线，`ambient.enabled = false` 整个关掉。重新开始（R）全部收回。
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
       主岛花丛（小号 / 大号，各一对合上→开放）：
         bg_41_flowers_small_closed.png + bg_41_flowers_small_open.png
         bg_41_flowers_big_closed.png   + bg_41_flowers_big_open.png
       小窝前后两层（Mochi 夹在中间）：bg_42_nest_back.png、bg_42_nest_front.png
       散落的云（备用，远景近景都能用）：bg_25_cloud_01.png … bg_25_cloud_15.png（layout 里摆了 6 朵）
       云带：bg_21_cloudbank_far（远景岛脚下的云海，16 m）、bg_22_cloudbank_mid（左右岛下方的毛线云，9.5 m）
       前景草丛：bg_61_grass_01 … 04 = 美术草丛合集里的 4 丛（04 是带小黄球那丛），摆在主岛下方的空白处
       现在的花丛是代替图：python tools/make_paper_flowers.py 画的纸艺花（花苞版直接是灰紫色，开放版彩色）。
                   美术交了真花，用同样的 4 个文件名（big/small × closed/open）覆盖即可；
                   同一丛的 closed 和 open 请用同一张画布导出（交叉淡入要对齐）
       四周（两侧、身后、脚下）：
         bg_05_ground            孩子脚下的纸地面（俯视图，平放在 y=0，"rot": [-90,0,0]）
         bg_50_windmill_body     右侧小岛上的风车塔身
         bg_51_windmill_blades   风车叶片：画布中心 = 转轴；右边恢复颜色后才开始转（"anim": "spin", "spinWhenColored": true）
         这三张现在是代替图：python tools/make_paper_scenery.py 画的，美术交真图用同名覆盖即可
         两侧小岛、两侧/身后的云带、散落的云 05…15 都是复用现有的图（layout 里用 "file" 指向原图）
       其他 bg 键 → {键}.png（layout 里 "optional": true 的层，文件不存在就不显示）
       layout 里每层还可以写：
         "face": true            放在两侧/身后的层整张转过来正对孩子（摆放时转一次，不是跟着头转）
         "rot": [x, y, z]        额外旋转（度）
         "sortZ": 数字           前后排序用的深度（默认用 z；face 的层用水平距离）
         "file" + "mode": "colorGray"  复用灰/彩成对的图（例如两侧小岛复用左右岛）
  fog/ fog_puff_01.png … fog_puff_04.png
  mochi/ mochi_pivots.json         支点像素坐标（1024 画布，左上角原点，y 向下）
         mochi_wing_left / wing_right / tail / body / belly / head
         mochi_eye_open / eye_closed / eye_happy
         mochi_mouth_closed / mouth_open / mouth_smile / mochi_blush
         mochi_sleep_body / mochi_sleep_belly        （全部 1024×1024，原位对齐）
  fx/  fx_zzz           美术的整组 Zzz 图：整组往上飘、淡入淡出（两组错开）；没有图时代码画单个 Z
       fx_flame_01..03  火焰从小到大三帧：喷火时按 01→02→03 播一遍后停在 03（三帧请用同一张画布导出、火焰朝右）
       fx_comfort_band
       fx_shell_long / fx_shell_short   保护壳（长 / 短）：long 是岛上方的“世界的顶”，short 在 Mochi 飞行区正上方
                        （在 layout.json 里用 "dir": "fx" 摆放；原来代码画的带涟漪保护膜已关掉，fx_ripple 不再需要）
       fx_dizzy_star    预留：将来碰到保护膜晕乎乎（P2），现在没用到
       fx_confetti_01…06  几何纸片（圆、菱形、四角星、方块、月牙、三角）：
                        四角星 = 吸满悬停时舒适带里闪的星星 + 星座里还没亮的星位；全部 = 结局放晴时飘落的纸屑
       fx_bird_01 / fx_bird_02        纸鸟两帧（翅膀朝上 / 朝下），同一张画布、鸟头朝右；身体用浅色，代码按每只鸟染一点颜色
       fx_butterfly_01 / _02          纸蝴蝶（俯视、左右对称，代码里左右压扁表现扇翅膀），粉 / 黄
                        这四张现在是代替图：python tools/make_paper_critters.py 画的，美术交真图用同名覆盖即可

合集图拆成单张：python tools/cutout_sheet.py 合集图 输出前缀 [--soft 毛边 | --chroma 绿幕] [--names a,b,c]
       fx_star_01..06   光团每次送星星按顺序换一种颜色（都没有时用 fx_star.png，再没有就代码画）
                        美术给不透明的浅色底星星图时：python tools/prep_stars.py 黄星星.png 紫星星.png
                        → 自动抠图并调色出 黄/紫/陶土橙/青石绿/粉/天蓝 6 张
  orb/ orb_core, orb_glow
  egg/ egg_cold / egg_warm / egg_crack / egg_shell_top / egg_shell_bottom
         现在是代替图：python tools/make_paper_egg.py 画的纸艺龙蛋。美术交真图用同名覆盖即可；
         五张请用同一张画布、蛋在同一个位置导出（叠在一起交叉淡入；上下半壳从裂缝处分开，裂缝高度 = config 里 egg.crackFromTop）
  audio/ bgm_pad_loop, sfx_snore, sfx_inhale_rise, sfx_hold, sfx_exhale_fall, sfx_huff,
         sfx_melt_chime, sfx_star, sfx_round_complete, sfx_sneeze, sfx_pat_drum,
         sfx_egg_warm, sfx_constellation, sfx_hatch   （.mp3）
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
src/egg.js           龙蛋（变暖、晃动、裂纹、孵化）+ 星座（每口深吸气点亮一颗星）
src/ambient.js       小动静：纸鸟、蝴蝶、飘浮的种子（跟着区域恢复出现）
src/tutorial.js      新手引导「Mochi 醒来的第一天」（孩子带头、Mochi 学孩子、旁白分级提示）
src/head.js          孩子的头：在看哪里、有没有安静下来、头往哪边歪（头显 / 桌面鼠标）
src/voice.js         旁白：读 config/voice.json，优先播录好的音频，没有就语音合成，同时给家长面板字幕
src/audio.js         铺底循环 + 各段音效（吸/停/呼音效按模板秒数截断，最后 0.2 秒淡出）
src/stateMachine.js  状态机（只读 template.json）
src/input.js         手柄 + 键盘
src/hud.js           桌面调试面板
```

调试：控制台里 `mochiDemo.sm.next()`、`mochiDemo.advance(秒)`（页面在后台时手动推进）。

整体调远近：`python tools/push_depth.py 距离近倍数 距离远倍数 看起来大小近 看起来大小远`（默认 `1.5 2.0 0.8 0.7`），会改写 `layout.json`，以孩子眼睛为中心把场景推远，近处推得少、远处推得多；草/篮子/花/雾这些贴在一起的层用同一个换算，不会错位。Mochi 变大变小时，光团、星星、火苗、Zzz 等身边特效自动等比缩放。

## 部署（GitHub Pages）

`.github/workflows/deploy.yml`：每次 push 到 `main`（包括在 GitHub 网页上传素材）都会自动构建并发布到 https://laplandog.github.io/arr-hackathon/ ，约 1–2 分钟。构建时会输出 `version.json`，页面启动时不走缓存读取它，所以重新部署后刷新就能看到新图。
