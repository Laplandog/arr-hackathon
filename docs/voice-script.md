# 旁白录音稿 · Narration Script（中英双语）

共 27 句，全部用在新手引导「Mochi 醒来的第一天」里。台词的源文件是 `public/config/voice.json`（`text` 中文，`en` 英文；改台词请两边一起改）。

**现在游戏里播英文旁白**：已经录了 22 句英文（表里 ✓），还有 **5 句待录**（表里 ✗，暂时用浏览器的英文语音合成念）。
网址加 `?lang=zh` 可以切回中文旁白（中文还没录，会用语音合成）。

## 还差这 5 句（英文）

| 文件名 | English | 中文 |
| --- | --- | --- |
| `vo_en_mirror_2` | What if you tilt your head? | 歪歪头试试？ |
| `vo_en_relax_2` | Little fireflies only come close to quiet friends. | 小萤火虫只敢靠近安静的小朋友哦。 |
| `vo_en_inhale_ok` | The fireflies are helping. Mochi is flying! | 萤火虫来帮忙，Mochi 飞起来啦！ |
| `vo_en_cough_ok` | The seed flew away! | 种子飞走啦！ |
| `vo_en_egg_ok` | The egg is a little warmer! | 龙蛋暖和一点啦！ |

`inhale_ok`、`egg_ok` 每次都会播，最好先补这两句；`cough_ok` 只在模板打开咳嗽时才用到。

## 录音要求

- **谁来录**：声音温柔的“讲故事的人”，第三人称（说“Mochi / it”，不说“我 / I”）。像睡前给孩子念绘本。
- **语速语气**：比平时说话慢一点；句尾“……”拖长、声音放轻；“Shh / 嘘”就真的轻声说。带“！”的句子替 Mochi 高兴，但**不要大声**；提示句是轻轻的建议，**不要像在下命令**。
- **格式**：每句一个文件，**m4a 或 mp3 都可以**（手机录音直接导出就行）。前后的空白、每句音量不一样都没关系：程序会自动剪掉前后空白、把音量拉到差不多大。
- **文件名**：英文 `vo_en_{键}.m4a`，中文 `vo_{键}.mp3`（例如 `vo_en_egg_ok.m4a`），上传到 `public/assets/audio/` 就行，**不用改代码**。录好的句子优先播录音，还没录的用浏览器的语音合成。
- **改了说法**：录的时候说法跟表里不一样也没关系，告诉我，或者直接改 `voice.json` 里那句的 `en`，字幕才对得上。

“一定会播”的句子每次都会出现；“孩子没反应才播”的提示句，孩子自己先做到了就不会播，但也要录。

## 1 看一看（孩子看着 Mochi，它就醒）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_wake_1` | 孩子没反应才播（第 1 句） | Shh… Mochi is still asleep. | 嘘……Mochi 还在睡觉呢。 |
| ✓ | `vo_en_wake_2` | 孩子没反应才播（第 2 句） | Look at Mochi. Maybe it will wake up. | 看看它，说不定它会醒哦。 |
| ✓ | `vo_en_wake_ok` | 孩子看着 Mochi，Mochi 醒来 | Mochi is awake! | Mochi 醒啦！ |

## 2 你动我也动（孩子做完动作，Mochi 学一遍）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_mirror_1` | 孩子没反应才播（第 1 句） | Hmm? Mochi seems to be copying you. | 咦？Mochi 好像在学你哦。 |
| ✗ | `vo_en_mirror_2` | 孩子没反应才播（第 2 句） | What if you tilt your head? | 歪歪头试试？ |
| ✓ | `vo_en_mirror_3` | 孩子没反应才播（第 3 句） | Give a little nod. Will Mochi copy you? | 点点头，看它学不学？ |
| ✓ | `vo_en_mirror_ok` | Mochi 学满 3 下 | Mochi is so good at copying you! | Mochi 学得真像！ |

## 3 一起放松（安静下来，萤火虫才会靠近）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_relax_1` | 孩子没反应才播（第 1 句） | Shh… Mochi is getting sleepy. | 嘘……Mochi 困了。 |
| ✗ | `vo_en_relax_2` | 孩子没反应才播（第 2 句） | Little fireflies only come close to quiet friends. | 小萤火虫只敢靠近安静的小朋友哦。 |
| ✓ | `vo_en_relax_3` | 孩子没反应才播（第 3 句） | Let's stay nice and quiet with Mochi for a while. | 陪 Mochi 安安静静待一会儿吧。 |
| ✓ | `vo_en_relax_ok` | 萤火虫停在孩子面前 | Here come the fireflies! | 萤火虫来啦！ |

## 4 吸一吸（萤火虫托起 Mochi，不需要操作）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_inhale_1` | 一定会播（这段开始） | Mochi wants to fly up to the clouds, but it can't fly yet… | Mochi 想飞到云上去，可它还不会飞…… |
| ✗ | `vo_en_inhale_ok` | 一定会播（萤火虫托起 Mochi） | The fireflies are helping. Mochi is flying! | 萤火虫来帮忙，Mochi 飞起来啦！ |
| ✓ | `vo_en_inhale_hold` | 一定会播（停一下，水滴往下落） | Shh… the dewdrop is about to fall… | 嘘——水滴要掉下来了…… |
| ✓ | `vo_en_inhale_down` | 一定会播（呼气，Mochi 降落） | Mochi is coming in to land… | Mochi 要降落啦…… |

## 5 哈一哈（Mochi 冻成冰蓝色）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_huff_1` | 孩子没反应才播（第 1 句） | Mochi is so cold… | Mochi 好冷呀…… |
| ✓ | `vo_en_huff_2` | 孩子没反应才播（第 2 句） | It's shivering, and its little flame is almost out… | 它冻得直发抖，小火苗也快熄了…… |
| ✓ | `vo_en_huff_3` | 孩子没反应才播（第 3 句） | How about a warm "haaa" to warm Mochi? | 哈一口热气，帮它暖暖吧！ |
| ✓ | `vo_en_huff_ok` | 孩子哈气，Mochi 变暖 | Mochi is warm now! Thank you! | Mochi 暖和啦！谢谢你！ |

## 6 咳一咳（只在模板打开 `includeCough` 时出现）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_cough_1` | 孩子没反应才播（第 1 句） | Oh dear, a little seed is stuck in Mochi's throat… | 哎呀，有颗小种子卡在 Mochi 喉咙里了…… |
| ✓ | `vo_en_cough_3` | 孩子没反应才播（第 2 句，只问一次） | Could a little cough help get the seed out? | 咳一下，帮它把种子弄出来？ |
| ✗ | `vo_en_cough_ok` | 孩子咳了，种子飞走 | The seed flew away! | 种子飞走啦！ |

## 7 暖暖龙蛋（收尾，然后进入正式练习）

| 录音 | 文件名 | 什么时候播 | English | 中文 |
| --- | --- | --- | --- | --- |
| ✓ | `vo_en_egg_1` | 一定会播（这段开始约 2 秒） | The dragon egg is so cold… | 龙蛋好冰呀…… |
| ✓ | `vo_en_egg_2` | 孩子没反应才播（第 2 句） | It's shivering too… | 它也冻得直发抖…… |
| ✓ | `vo_en_egg_3` | 孩子没反应才播（第 3 句） | Just like before, how about a warm "haaa" for the egg? | 像刚才那样，哈一口热气给它吧！ |
| ✗ | `vo_en_egg_ok` | 孩子哈气，龙蛋变暖 | The egg is a little warmer! | 龙蛋暖和一点啦！ |
| ✓ | `vo_en_egg_go` | 一定会播（进入正式练习前） | Let's keep warming it up together! | 我们一起让它越来越暖吧！ |
