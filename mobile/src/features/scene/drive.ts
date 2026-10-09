import { useEffect, useRef } from 'react';
import { useClock } from '@shopify/react-native-skia';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { TIMING, micLevel, useSceneStore } from './bridge';
import type { SceneValues } from './types';

/** Traduz estado da experiência (fase + efeitos) em shared values animadas para a cena. */
export function useSceneValues(): SceneValues {
  const clock = useClock();
  const intro = useSharedValue(0);
  const summon = useSharedValue(0);
  const appear = useSharedValue(0);
  const glow = useSharedValue(0.15);
  const speak = useSharedValue(0);
  const listen = useSharedValue(0);
  const think = useSharedValue(0);
  const flash = useSharedValue(0);
  const boltSeed = useSharedValue(1);
  const wish = useSharedValue(0);
  const shake = useSharedValue(0);
  const poke = useSharedValue(0);

  const phase = useSceneStore((s) => s.m.phase);
  const speaking = useSceneStore((s) => s.speaking);
  const fx = useSceneStore((s) => s.fx);
  const prev = useRef({ ...fx });

  // intro das esferas (uma única vez)
  useEffect(() => {
    intro.value = withDelay(400, withTiming(1, { duration: 3400, easing: Easing.out(Easing.cubic) }));
  }, [intro]);

  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    switch (phase) {
      case 'boot':
        break;
      case 'hunt':
      case 'altar':
        intro.value = 1;
        cancelAnimation(summon);
        cancelAnimation(appear);
        summon.value = withTiming(0, { duration: 700 });
        appear.value = withTiming(0, { duration: 700 });
        glow.value = withTiming(0.15, { duration: 700 });
        break;
      case 'summoning':
        summon.value = 0;
        appear.value = 0;
        glow.value = withTiming(1, { duration: 400 });
        summon.value = withTiming(1, { duration: TIMING.summon, easing: Easing.in(Easing.quad) });
        break;
      case 'appearing':
        summon.value = 1;
        appear.value = 0;
        appear.value = withTiming(1, { duration: TIMING.appear, easing: ease });
        break;
      case 'disappearing':
        // o dragão volta para a luz, depois as esferas descem ao altar
        appear.value = withTiming(0, { duration: TIMING.disappear * 0.6, easing: Easing.in(Easing.quad) });
        summon.value = withDelay(TIMING.disappear * 0.55, withTiming(0, { duration: TIMING.disappear * 0.45, easing: ease }));
        break;
      default:
        summon.value = 1;
        appear.value = 1;
    }
    listen.value = withTiming(phase === 'listening' ? 1 : 0, { duration: 450 });
    think.value = withTiming(phase === 'thinking' ? 1 : 0, { duration: 500 });
  }, [phase, summon, appear, glow, intro, listen, think]);

  useEffect(() => {
    speak.value = withTiming(speaking ? 1 : 0, { duration: 160 });
  }, [speaking, speak]);

  useEffect(() => {
    const p = prev.current;
    if (fx.bolt !== p.bolt) {
      boltSeed.value = fx.bolt;
      flash.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0.35, { duration: 90 }), withTiming(0.8, { duration: 50 }), withTiming(0, { duration: 700 }));
      if (fx.boltBig) shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 900 }));
    }
    if (fx.wish !== p.wish) {
      wish.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 2200, easing: Easing.out(Easing.quad) }));
      flash.value = withSequence(withTiming(0.8, { duration: 80 }), withTiming(0, { duration: 900 }));
    }
    if (fx.heard !== p.heard && phase === 'altar') {
      glow.value = withSequence(withTiming(1, { duration: 140 }), withDelay(1800, withTiming(0.15, { duration: 900 })));
    }
    if (fx.missed !== p.missed && phase === 'altar') {
      glow.value = withTiming(0.15, { duration: 600 });
    }
    if (fx.poke !== p.poke) {
      poke.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 900 }));
    }
    prev.current = { ...fx };
  }, [fx, phase, boltSeed, flash, shake, wish, glow, poke]);

  return { clock, intro, summon, appear, glow, speak, listen, think, flash, boltSeed, wish, shake, poke, mic: micLevel };
}
