import { TIMING } from '../experience/timing';
import { useStore } from '../experience/store';
import type { Phase } from '@/core/machine';
import type { DragonInput } from './core/types';

type Ease = (x: number) => number;
const linear: Ease = (x) => x;
const inQuad: Ease = (x) => x * x;
const outQuad: Ease = (x) => 1 - (1 - x) * (1 - x);
const inOutQuad: Ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

interface Step {
  to: number;
  dur: number;
  ease?: Ease;
  delay?: number;
}

/** Valor animado no JS (o render 3D roda no thread JS, junto com o expo-gl). */
class Anim {
  private segs: { from: number; to: number; t0: number; t1: number; ease: Ease }[] = [];
  constructor(private v: number) {}
  set(v: number) {
    this.v = v;
    this.segs = [];
  }
  run(now: number, steps: Step[]) {
    let from = this.get(now);
    let t = now;
    this.segs = [];
    for (const s of steps) {
      const t0 = t + (s.delay ?? 0);
      this.segs.push({ from, to: s.to, t0, t1: t0 + Math.max(1, s.dur), ease: s.ease ?? linear });
      from = s.to;
      t = t0 + s.dur;
    }
  }
  get(now: number) {
    let v = this.v;
    for (const s of this.segs) {
      if (now < s.t0) break;
      v = now >= s.t1 ? s.to : s.from + (s.to - s.from) * s.ease((now - s.t0) / (s.t1 - s.t0));
    }
    if (this.segs.length && now >= this.segs[this.segs.length - 1]!.t1) {
      this.v = v;
      this.segs = [];
    }
    return v;
  }
}

/** Espelha (no JS) a mesma coreografia da cena 2D (drive.ts), a partir do store. */
export class DragonTimeline {
  private a = {
    appear: new Anim(0), summon: new Anim(0), speak: new Anim(0), listen: new Anim(0), think: new Anim(0),
    wish: new Anim(0), flash: new Anim(0), poke: new Anim(0), glow: new Anim(0.15),
  };
  private unsub: () => void;
  private out: DragonInput = { t: 0, appear: 0, summon: 0, speak: 0, listen: 0, think: 0, wish: 0, flash: 0, poke: 0, glow: 0.15 };

  constructor() {
    let prev = useStore.getState();
    this.applyPhase(prev.m.phase, performance.now());
    this.unsub = useStore.subscribe((s) => {
      const now = performance.now();
      if (s.m.phase !== prev.m.phase) this.applyPhase(s.m.phase, now);
      if (s.speaking !== prev.speaking) this.a.speak.run(now, [{ to: s.speaking ? 1 : 0, dur: 160 }]);
      const f = s.fx, p = prev.fx;
      if (f.bolt !== p.bolt)
        this.a.flash.run(now, [{ to: 1, dur: 40 }, { to: 0.35, dur: 90 }, { to: 0.8, dur: 50 }, { to: 0, dur: 700, ease: outQuad }]);
      if (f.wish !== p.wish) {
        this.a.wish.run(now, [{ to: 1, dur: 120 }, { to: 0, dur: 2200, ease: outQuad }]);
        this.a.flash.run(now, [{ to: 0.8, dur: 80 }, { to: 0, dur: 900 }]);
      }
      if (f.heard !== p.heard && s.m.phase === 'altar') this.a.glow.run(now, [{ to: 1, dur: 140 }, { to: 0.15, dur: 900, delay: 1800 }]);
      if (f.missed !== p.missed && s.m.phase === 'altar') this.a.glow.run(now, [{ to: 0.15, dur: 600 }]);
      if (f.poke !== p.poke) this.a.poke.run(now, [{ to: 1, dur: 120 }, { to: 0, dur: 900 }]);
      prev = s;
    });
  }

  private applyPhase(phase: Phase, now: number) {
    const { appear, summon, glow, listen, think } = this.a;
    switch (phase) {
      case 'boot':
        break;
      case 'altar':
        summon.run(now, [{ to: 0, dur: 700 }]);
        appear.run(now, [{ to: 0, dur: 700 }]);
        glow.run(now, [{ to: 0.15, dur: 700 }]);
        break;
      case 'summoning':
        summon.set(0);
        appear.set(0);
        glow.run(now, [{ to: 1, dur: 400 }]);
        summon.run(now, [{ to: 1, dur: TIMING.summon, ease: inQuad }]);
        break;
      case 'appearing':
        summon.set(1);
        appear.set(0);
        appear.run(now, [{ to: 1, dur: TIMING.appear, ease: inOutQuad }]);
        break;
      case 'disappearing':
        appear.run(now, [{ to: 0, dur: TIMING.disappear * 0.6, ease: inQuad }]);
        summon.run(now, [{ to: 0, dur: TIMING.disappear * 0.45, ease: inOutQuad, delay: TIMING.disappear * 0.55 }]);
        break;
      default:
        summon.set(1);
        if (appear.get(now) < 0.999) appear.run(now, [{ to: 1, dur: 400 }]);
    }
    listen.run(now, [{ to: phase === 'listening' ? 1 : 0, dur: 450 }]);
    think.run(now, [{ to: phase === 'thinking' ? 1 : 0, dur: 500 }]);
  }

  sample(now: number): DragonInput {
    const o = this.out;
    o.t = now;
    for (const k of Object.keys(this.a) as (keyof typeof this.a)[]) o[k] = this.a[k].get(now);
    return o;
  }

  dispose() {
    this.unsub();
  }
}
