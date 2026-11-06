# 旁白录音稿 · Narration Script（中英双语）

共 27 句，全部用在新手引导「Mochi 醒来的第一天」里。台词的源文件是 `public/config/voice.json`（改台词请两边一起改）。

## 录音要求

- **谁来录**：声音温柔的“讲故事的人”，第三人称（说“Mochi / 它”，不说“我”）。像睡前给孩子念绘本。
- **语速**：比平时说话慢一点。句尾“……”拖长、声音放轻；“嘘”就真的轻声说。
- **语气**：带“！”的句子是开心、替 Mochi 高兴，但**不要大声**；提示句（第 2、3 句）是轻轻的建议，**不要像在下命令**。
- **格式**：每句一个文件，导出 **mp3**（44.1 kHz，单声道就行）；句子前后各留约 0.2 秒空白，不要更长（会让声音晚出来）。
- **音量**：全部录完后统一响度（Audacity → 效果 → 响度标准化 → -16 LUFS），这样每句一样大，也不会盖过背景音乐。
- **文件名**：`vo_{键}.mp3`，例如 `vo_huff_1.mp3`，上传到 `public/assets/audio/` 就行，**不用改代码**。录好的句子优先播录音，还没录的继续用浏览器的语音合成。
- **英文版**：英文是给汇报、给评委看的翻译；现在游戏里只播中文。要做英文版录音的话，代码需要加一个语言开关（文件名会是 `vo_en_{键}.mp3`）。

“一定会播”的句子每次都会出现；“孩子没反应才播”的提示句，孩子自己先做到了就不会播，但也要录。

## 1 看一看（孩子看着 Mochi，它就醒）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_wake_1` | 孩子没反应才播（第 1 句） | 嘘……Mochi 还在睡觉呢。 | Shh… Mochi is still asleep. |
| `vo_wake_2` | 孩子没反应才播（第 2 句） | 看看它，说不定它会醒哦。 | Look at Mochi. Maybe it will wake up. |
| `vo_wake_ok` | 孩子看着 Mochi，Mochi 醒来 | Mochi 醒啦！ | Mochi is awake! |

## 2 你动我也动（Mochi 学孩子歪头、转头）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_mirror_1` | 孩子没反应才播（第 1 句） | 咦？Mochi 好像在学你哦。 | Hmm? Mochi seems to be copying you. |
| `vo_mirror_2` | 孩子没反应才播（第 2 句） | 歪歪头试试？ | What if you tilt your head? |
| `vo_mirror_3` | 孩子没反应才播（第 3 句） | 点点头，看它学不学？ | Give a little nod. Will Mochi copy you? |
| `vo_mirror_ok` | Mochi 学满 3 下 | Mochi 学得真像！ | Mochi copies you so well! |

## 3 一起放松（安静下来，萤火虫才会靠近）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_relax_1` | 孩子没反应才播（第 1 句） | 嘘……Mochi 困了。 | Shh… Mochi is getting sleepy. |
| `vo_relax_2` | 孩子没反应才播（第 2 句） | 小萤火虫只敢靠近安静的小朋友哦。 | Little fireflies only come close to quiet friends. |
| `vo_relax_3` | 孩子没反应才播（第 3 句） | 陪 Mochi 安安静静待一会儿吧。 | Let's stay nice and quiet with Mochi for a while. |
| `vo_relax_ok` | 萤火虫停在孩子面前 | 萤火虫来啦！ | Here come the fireflies! |

## 4 吸一吸（萤火虫托起 Mochi，不需要操作）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_inhale_1` | 一定会播（这段开始） | Mochi 想飞到云上去，可它还不会飞…… | Mochi wants to fly up to the clouds, but it can't fly yet… |
| `vo_inhale_ok` | 一定会播（萤火虫托起 Mochi） | 萤火虫来帮忙，Mochi 飞起来啦！ | The fireflies are helping. Mochi is flying! |
| `vo_inhale_hold` | 一定会播（停一下，水滴往下落） | 嘘——水滴要掉下来了…… | Shh… a water drop is about to fall… |
| `vo_inhale_down` | 一定会播（呼气，Mochi 降落） | Mochi 要降落啦…… | Mochi is coming down to land… |

## 5 哈一哈（Mochi 冻成冰蓝色）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_huff_1` | 孩子没反应才播（第 1 句） | Mochi 好冷呀…… | Mochi is so cold… |
| `vo_huff_2` | 孩子没反应才播（第 2 句） | 它冻得直发抖，小火苗也快熄了…… | It's shivering, and its little flame is almost out… |
| `vo_huff_3` | 孩子没反应才播（第 3 句） | 哈一口热气，帮它暖暖吧！ | How about a warm "haaa" to warm it up? |
| `vo_huff_ok` | 孩子哈气，Mochi 变暖 | Mochi 暖和啦！谢谢你！ | Mochi is warm now! Thank you! |

## 6 咳一咳（只在模板打开 `includeCough` 时出现）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_cough_1` | 孩子没反应才播（第 1 句） | 哎呀，有颗小种子卡在 Mochi 喉咙里了…… | Oh dear, a little seed is stuck in Mochi's throat… |
| `vo_cough_3` | 孩子没反应才播（第 2 句，只问一次） | 咳一下，帮它把种子弄出来？ | Could a little cough help get the seed out? |
| `vo_cough_ok` | 孩子咳了，种子飞走 | 种子飞走啦！ | The seed flew away! |

## 7 暖暖龙蛋（收尾，然后进入正式练习）

| 文件名 | 什么时候播 | 中文 | English |
| --- | --- | --- | --- |
| `vo_egg_1` | 一定会播（这段开始约 2 秒） | 龙蛋好冰呀…… | The dragon egg is so cold… |
| `vo_egg_2` | 孩子没反应才播（第 2 句） | 它也冻得直发抖…… | It's shivering too… |
| `vo_egg_3` | 孩子没反应才播（第 3 句） | 像刚才那样，哈一口热气给它吧！ | Just like before, how about a warm "haaa" for the egg? |
| `vo_egg_ok` | 孩子哈气，龙蛋变暖 | 龙蛋暖和一点啦！ | The egg is a little warmer! |
| `vo_egg_go` | 一定会播（进入正式练习前） | 我们一起让它越来越暖吧！ | Let's keep warming it up together! |
