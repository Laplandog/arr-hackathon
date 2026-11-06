// 状态机：INTRO → TUTORIAL（新手引导，可关）→ SLEEP → [ FLY → HUFF → SETTLE ] × rounds → END，另有全局 PAUSE。
// 只读 template.json（示意，非临床参数）。
// 硬规则：没有失败、没有分数、没有 Miss；进度永远不倒退；火苗大小、飞行高度都是固定动画，与任何输入强度无关。
import { CONFIG } from './config.js';
import { ease } from './util.js';

const T = CONFIG.timing;

/** 一个状态里的小步骤序列。dur = null 表示“等待家长按键”。暂停时冻结；继续时从 restartAt 重新开始。 */
class Runner {
  constructor() { this.steps = []; this.i = 0; this.t = 0; this.frozen = false; this.active = false; this.onDone = null; }
  run(steps, onDone = null) { this.steps = steps; this.onDone = onDone; this.i = 0; this.active = true; this._enter(); }
  _enter() {
    while (this.i < this.steps.length) {
      const s = this.steps[this.i];
      this.t = 0;
      s.enter?.();
      if (s.dur === 0) { s.exit?.(); this.i++; continue; }
      return;
    }
    this.active = false;
    const cb = this.onDone; this.onDone = null; cb?.();
  }
  update(dt) {
    if (!this.active || this.frozen) return;
    const s = this.steps[this.i];
    if (s.dur == null) { s.update?.(dt); return; }
    this.t += dt;
    s.update?.(Math.min(1, this.t / s.dur), dt);
    if (this.t >= s.dur) { s.exit?.(); this.i++; this._enter(); }
  }
  get step() { return this.active ? this.steps[this.i] : null; }
  restartCurrent() {
    if (!this.active) return;
    const s = this.steps[this.i];
    this.i = s.restartAt ?? this.i;
    this._enter();
  }
  cancel() { this.active = false; this.onDone = null; this.steps = []; }
}

export class StateMachine {
  constructor({ template, mochi, fx, audio, getSettings }) {
    this.template = template; this.mochi = mochi; this.fx = fx; this.audio = audio; this.getSettings = getSettings;
    this.runner = new Runner();
    this.state = 'INTRO'; this.paused = false; this.early = false;
    this.round = 1; this.huffInRound = 0; this.globalHuff = 0; this.breath = 0;
    this.huffQueued = false; this.greeted = false;
    this.log = [];
  }
  get s() { return this.getSettings(); }
  get breathsPerRound() { return Math.max(1, this.template.expansionBreaths | 0); }
  get totalBreaths() { return Math.max(1, this.template.rounds | 0) * this.breathsPerRound; }
  /** 完成第 r 轮后龙蛋该到第几格：按轮数平均分，最后一轮正好到“出现裂纹”（3），END 时孵化 */
  eggStageAfter(r) {
    const R = Math.max(1, this.template.rounds | 0);
    return Math.max(1, Math.min(3, Math.round((3 * r) / R)));
  }
  _log(msg) { console.log(`%c[状态] ${msg}`, 'color:#6a4bc4'); }

  // ───────────── 外部接口 ─────────────
  start() { this.restart(); }

  canNext() {
    if (this.state === 'TUTORIAL') return !this.paused && !!this.tutorial?.canConfirm;
    const st = this.runner.step;
    return !this.paused && this.state !== 'END' && !!st && st.dur == null;
  }
  get stepName() {
    if (this.state === 'TUTORIAL') return this.tutorial?.label || '';
    const st = this.runner.step;
    if (!st) return '';
    return typeof st.name === 'function' ? st.name() : st.name || '';
  }

  next() {
    if (this.paused) { this._log('暂停中，忽略“下一步”（按暂停键继续）'); return; }
    if (this.state === 'TUTORIAL') { this.tutorial?.confirm(); return; } // 引导里 Space = 孩子做到了
    this._nextMain();
  }
  /** 家长按 T：引导里让提示再进一级 */
  hint() { if (this.state === 'TUTORIAL' && !this.paused) this.tutorial?.hint(); else this._log('提示键只在新手引导里用'); }
  /** 家长按 S：跳过新手引导 */
  skipTutorial() { if (this.state === 'TUTORIAL' && !this.paused) this.tutorial?.skip(); }

  _nextMain() {
    const st = this.runner.step;
    if (this.state === 'END') { this._log('已结束；按“重新开始”回到 INTRO'); return; }
    if (!st || st.dur != null) {
      if (this.state === 'HUFF' && st?.kind === 'huff' && !this.huffQueued && this.huffInRound < this.template.huffs) {
        this.huffQueued = true; this._log('哈气确认已排队（动画结束后执行）');
      } else this._log(`当前步骤「${this.stepName}」还没结束，忽略“下一步”`);
      return;
    }
    this[`next_${this.state}`]?.();
  }

  togglePause() {
    if (this.state === 'END' && !this.paused) { this._log('END 状态不需要暂停'); return; }
    if (!this.paused) {
      this.paused = true;
      this.runner.frozen = true;
      this.audio.setMaster(CONFIG.audio.pauseMaster);
      this.audio.stopTag('step');
      this.mochi.rest();
      this.fx.band.setBright(false);
      this.fx.orb.snuggle(this.mochi.centerWorld().setY(this.s.groundY));
      if (this.state === 'TUTORIAL') this.tutorial?.pause();
      this._log(`PAUSE（${this.state} · ${this.stepName}）：光团靠着 Mochi，音量 40%，计时冻结`);
    } else {
      this.paused = false;
      this.runner.frozen = false;
      this.audio.setMaster(1);
      if (this.state === 'INTRO' && !this.greeted) this.fx.orb.flyAway(); else this.fx.orb.toRest();
      if (this.state === 'TUTORIAL') { this.tutorial?.resume(); this._log('继续：从引导的这一段重新开始'); return; }
      this._resumeVisuals();
      this._log(`继续：从「${this.stepName}」所在的小步骤重新开始`);
      this.runner.restartCurrent();
    }
  }

  /** 结束键：温和收尾（Mochi 飞回窝，保留进度） */
  end() {
    if (this.state === 'END') return;
    if (this.paused) { this.paused = false; this.runner.frozen = false; this.audio.setMaster(1); }
    this._log('结束键：温和收尾，保留已恢复的颜色');
    this.enter('END', { early: true });
  }

  restart() {
    this.paused = false; this.runner.cancel(); this.runner.frozen = false;
    this.audio.setMaster(1); this.audio.stopAllSfx(); this.audio.bgmTo(CONFIG.audio.bgmVolume, 1);
    this.audio.bgm.pos = {}; // 新的一次：每首都从头放
    this.round = 1; this.huffInRound = 0; this.globalHuff = 0; this.breath = 0; this.huffQueued = false;
    this.greeted = false; this.early = false;
    this.tutorial?.stop();
    this.fx.resetAll();
    this.fx.sky.reset(this.totalBreaths);
    this.mochi.reset();
    this.fx.orb.placeFar();
    this.audio.startBgm();
    this.enter('INTRO');
  }

  update(dt) {
    this.clock = (this.clock || 0) + dt;
    this.tutorial?.tick(dt); // 飞行中的热气等（正式练习的哈气也用）
    if (this.state === 'TUTORIAL' && !this.paused) this.tutorial?.update(dt, this.clock);
    this.runner.update(dt);
    // 动画期间排队的哈气确认
    if (this.huffQueued && this.state === 'HUFF' && this.canNext()) { this.huffQueued = false; this.next(); }
  }

  enter(name, opts = {}) {
    this.state = name;
    this._log(`→ ${name}`);
    // 背景音乐跟着阶段换（END 在 enter_END 里按是否提前结束决定）
    const track = { INTRO: 'intro', TUTORIAL: 'intro', SLEEP: 'main', FLY: 'fly', HUFF: 'main', SETTLE: 'main' }[name];
    if (track) this.audio.bgmPlay(track);
    this[`enter_${name}`](opts);
  }

  // ───────────── 公共小步骤 ─────────────
  _wait(name, enter) { return { name, dur: null, enter }; }

  /** 光团飞向 Mochi，送上一颗星星 → Mochi 醒来/变得有精神 */
  _starStep() {
    const S = CONFIG.orb.star;
    return {
      name: '光团送星星', dur: S.flySec + S.dropSec + 0.1,
      enter: () => {
        this.fx.orb.sendStar(this.mochi.headTopWorld(), this.fx.stars, () => {
          this.mochi.wake(); this.fx.zzz.set(false); this.audio.loop('sfx_snore', false);
        });
      },
    };
  }
  _sleepVisuals() {
    this.mochi.setPose('sleep'); this.mochi.setWings('fold'); this.mochi.setHover(false); this.mochi.setWaitMode(false);
    this.mochi.calm(); this.fx.zzz.set(true);
  }
  _resumeVisuals() {
    const st = this.runner.step;
    const sleeping = this.state === 'INTRO' || this.state === 'SLEEP' || (this.state === 'SETTLE' && st?.dur == null);
    if (sleeping) { this._sleepVisuals(); return; }
    if (this.state === 'END') return;
    this.mochi.wake(); this.fx.zzz.set(false);
  }

  // ───────────── INTRO ─────────────
  enter_INTRO() {
    this._sleepVisuals();
    this.audio.loop('sfx_snore', true); // 开场 Mochi 在窝里打呼噜
    this.runner.run([this._wait('等待开始（光团还在远处）')]);
  }
  next_INTRO() {
    const d = this.fx.orb.greetDuration();
    this.runner.run([{
      name: '光团飞来打招呼', dur: d,
      enter: () => { this.fx.orb.greet(this.mochi.centerWorld()); this.greeted = true; },
    }], () => this.enter(this.template.tutorial && this.tutorial ? 'TUTORIAL' : 'SLEEP'));
  }

  // ───────────── TUTORIAL（新手引导「Mochi 醒来的第一天」，见 tutorial.js） ─────────────
  enter_TUTORIAL() {
    this.runner.cancel();
    this.tutorial.start(() => this.enter('SLEEP'));
  }

  // ───────────── SLEEP（放松呼吸，不要求跟拍） ─────────────
  enter_SLEEP() {
    this.runner.run([this._wait('睡觉打呼噜（放松呼吸）', () => {
      this._sleepVisuals(); this.audio.loop('sfx_snore', true);
    })]);
  }
  next_SLEEP() {
    this.runner.run([this._starStep(), { name: '醒来', dur: T.wakeSec }], () => this.enter('FLY'));
  }

  // ───────────── FLY（胸廓扩张：吸 → 停 → 呼 × N） ─────────────
  enter_FLY() {
    const tp = this.template, s = this.s, m = this.mochi, fx = this.fx;
    const N = Math.max(1, tp.expansionBreaths | 0);
    fx.band.show(true);
    m.setPose('stand'); m.setWaitMode(false); fx.zzz.set(false);
    if (Math.abs(m.x.v - s.flightPos.x) > 0.01 || Math.abs(m.z.v - s.flightPos.z) > 0.01) m.toFlightStart(0.5);
    const steps = [];
    for (let b = 0; b < N; b++) {
      const base = steps.length;
      steps.push({
        name: `吸气 ${b + 1}/${N}`, dur: tp.inhaleSec, restartAt: base,
        enter: () => {
          this.breath = b + 1;
          m.setPose('stand'); m.setWaitMode(false); m.setHover(false); m.calm(); fx.zzz.set(false);
          m.setWings('flap'); m.flyY(s.band.center, tp.inhaleSec, ease.inOutSine); m.setBelly(CONFIG.mochi.inhaleBelly, tp.inhaleSec);
          fx.band.show(true); fx.band.setBright(false);
          this.audio.play('sfx_inhale_rise', { dur: tp.inhaleSec, tag: 'step' });
        },
      });
      steps.push({
        name: `吸满停一下 ${b + 1}/${N}`, dur: tp.holdSec, restartAt: base,
        enter: () => {
          m.setHover(true); m.setWings('hover'); m.setEyes('happy');
          fx.band.setBright(true);
          this.audio.play('sfx_hold', { dur: tp.holdSec, tag: 'step' });
          // 吸满了：从 Mochi 头顶飞起一个光点，点亮天上的一颗星（暂停后重来不会重复点亮）
          fx.sky.light((this.round - 1) * N + b, m.headTopWorld());
        },
      });
      steps.push({
        name: `放松呼气 ${b + 1}/${N}`, dur: tp.exhaleSec, restartAt: base,
        enter: () => {
          m.setHover(false); m.setEyes('open'); m.setWings('glide');
          m.flyY(s.groundY, tp.exhaleSec, ease.inOutSine); m.setBelly(1, tp.exhaleSec);
          fx.band.setBright(false);
          this.audio.play('sfx_exhale_fall', { dur: tp.exhaleSec, tag: 'step' });
        },
      });
      if (b < N - 1) steps.push({ name: '落地歇一下', dur: T.restBetweenBreathsSec, restartAt: base + 4, enter: () => m.setWings('fold') });
    }
    steps.push(this._wait(`等待家长确认（深呼吸 ${N}/${N} 完成）`, () => {
      m.setPose('stand'); m.setWings('fold'); m.setHover(false); m.calm(); m.setWaitMode(true);
      if (Math.abs(m.y.v - s.groundY) > 0.005) m.flyY(s.groundY, 0.4);
      fx.band.show(false);
    }));
    this.runner.run(steps);
  }
  next_FLY() {
    this.runner.run([this._starStep(), { name: '变得有精神', dur: 0.3 }], () => this.enter('HUFF'));
  }

  // ───────────── HUFF（哈气：每次确认融化一团雾） ─────────────
  _huffWait() {
    return this._wait(() => `等待确认哈气（本轮 ${this.huffInRound}/${this.template.huffs}）`, () => {
      this.mochi.setPose('stand'); this.mochi.setWings('fold'); this.mochi.setWaitMode(true); this.fx.zzz.set(false);
      if (this.huffInRound < this.template.huffs) this.mochi.faceToward(this.fx.nextFogTarget(this.globalHuff));
    });
  }
  enter_HUFF() {
    this.huffInRound = 0; this.huffQueued = false;
    const m = this.mochi, fx = this.fx;
    const target = fx.nextFogTarget(this.globalHuff);
    m.faceToward(target);
    this.runner.run([{
      name: '哈火示范', dur: T.huffDemoSec, restartAt: 1,
      enter: () => {
        m.setPose('stand'); m.setWaitMode(false);
        const aim = target || m.mouthWorld().add({ x: 0.3, y: 0.15, z: -0.4 });
        m.huff(() => { fx.flames.shoot(m.mouthWorld(), aim, { demo: true }); this.audio.play('sfx_huff', { vol: CONFIG.audio.sfxVolume * 0.6, dur: CONFIG.audio.huffSoundSec }); });
      },
    }, this._huffWait()]);
  }
  next_HUFF() {
    if (this.huffInRound < this.template.huffs) this._doHuff();
    else this.enter('SETTLE');
  }
  _doHuff() {
    const m = this.mochi, fx = this.fx;
    this.huffInRound++; this.globalHuff++;
    const zone = this.globalHuff - 1;
    const target = fx.zoneTarget(zone);
    const last = this.huffInRound >= this.template.huffs;
    this._log(`确认哈气 #${this.globalHuff}（本轮 ${this.huffInRound}/${this.template.huffs}）→ 区域 z${zone + 1}`);
    m.faceToward(target);
    // 先从孩子嘴前飞一团热气进 Mochi 嘴里，Mochi 再喷火：孩子看得见“我的气 → Mochi 的火 → 雾散了”
    const lead = this.tutorial ? T.childBreathSec : T.huffFlashLeadSec;
    this.tutorial?.childBreath(m.mouthWorld(), lead);
    // 进度在按下时就记下：雾一定会融化，即使中途暂停（进度永远不倒退）
    const meltDelay = lead + CONFIG.mochi.huff.backSec + CONFIG.flame.travelSec * 0.85;
    fx.sched.after(meltDelay, () => fx.meltZone(zone));
    fx.orb.flash();
    fx.sched.after(lead, () => {
      m.huff(() => {
        if (!this.tutorial) this.audio.play('sfx_huff', { dur: CONFIG.audio.huffSoundSec }); // 有引导模块时，哈气声在孩子的热气飞出时已经放过
        const aim = target || m.mouthWorld().add({ x: 0.3, y: 0.15, z: -0.4 });
        fx.flames.shoot(m.mouthWorld(), aim, { demo: !target });
      });
    });
    this.runner.run([{
      name: '哈火融雾', kind: 'huff', dur: T.huffStepSec + (lead - T.huffFlashLeadSec), restartAt: 1,
      enter: () => { m.setPose('stand'); m.setWaitMode(false); },
      exit: () => { if (last) m.happy(); },
    }, this._huffWait()]);
  }

  // ───────────── SETTLE（回到放松） ─────────────
  enter_SETTLE() {
    const m = this.mochi;
    m.faceToward(null);
    this.runner.run([
      {
        name: '飞回小窝', dur: CONFIG.mochi.settleSec + 0.1, restartAt: 0,
        enter: () => { m.setPose('stand'); m.setWaitMode(false); m.calm(); m.setWings('flap'); m.flyHome(CONFIG.mochi.settleSec); },
      },
      this._wait(() => (this.round < this.template.rounds ? `回窝打呼噜（第 ${this.round}/${this.template.rounds} 轮完成）` : '回窝打呼噜（全部轮次完成）'), () => {
        this._sleepVisuals(); this.audio.loop('sfx_snore', true);
        // 一轮完成：星光落到龙蛋上，蛋暖一格（进度在这里记下，之后暂停/结束都保留）
        this.fx.warmEgg(this.eggStageAfter(this.round));
      }),
    ]);
  }
  next_SETTLE() {
    if (this.round < this.template.rounds) {
      this.round++;
      this._log(`第 ${this.round} 轮`);
      this.runner.run([this._starStep(), { name: '醒来', dur: T.wakeSec }], () => this.enter('FLY'));
    } else this.enter('END');
  }

  // ───────────── END ─────────────
  enter_END({ early = false } = {}) {
    const m = this.mochi, fx = this.fx;
    this.early = early;
    this.tutorial?.stop();
    this.runner.cancel();
    this.audio.stopTag('step');
    fx.band.show(false);
    m.faceToward(null);
    // 全部完成：换成结尾的曲子（放晴 + 孵化）；提前结束：当前的曲子慢慢变小
    if (early) this.audio.bgmTo(CONFIG.audio.bgmEndVolume, 4);
    else this.audio.bgmPlay('end', 3);
    if (!early) {
      // 天空放晴；Mochi 醒来开心；星光落到龙蛋上，光团（家长）飞到蛋旁边，和 Mochi 一起看着蛋孵化；音乐收尾
      this.audio.loop('sfx_snore', false); fx.zzz.set(false);
      fx.clearSky();
      this.audio.play('sfx_round_complete');
      m.wake();
      fx.sched.after(0.5, () => m.happy());
      fx.orb.glowAt(fx.egg.besidePos());
      const hatchSec = fx.hatchEgg(() => m.happy({ spin: true }));
      this.runner.run([
        { name: hatchSec ? '天空放晴 · 龙蛋孵化' : '天空放晴', dur: Math.max(T.endCelebrateSec, hatchSec + 1.5) },
        this._wait('完成！（按“重新开始”回到 INTRO）', () => fx.orb.glowAt(fx.egg.besidePos())),
      ]);
    } else {
      // 提前结束：温和收尾，Mochi 飞回窝，已恢复的颜色保留，没有任何“失败”表现
      const atHome = Math.abs(m.x.v - m.home.x) < 0.01 && Math.abs(m.y.v - m.home.y) < 0.01 && m.pose === 'sleep';
      this.runner.run([
        {
          name: '一起飞回小窝', dur: atHome ? 0.1 : CONFIG.mochi.settleSec + 0.1,
          enter: () => {
            fx.orb.endGlow(m.home.clone());
            if (!atHome) { m.setPose('stand'); m.calm(); m.setWings('flap'); m.flyHome(CONFIG.mochi.settleSec); }
          },
        },
        this._wait('今天就到这里（按“重新开始”回到 INTRO）', () => { this._sleepVisuals(); m.setBelly(1, 0.3); }),
      ]);
    }
  }
}
