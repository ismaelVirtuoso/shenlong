import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<void>) => { fn().catch(() => {}); };

export const hap = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

/** Sequência de pulsos que acelera e intensifica (carga da invocação). */
export function rampHaptics(durationMs: number, stop: () => boolean) {
  const t0 = Date.now();
  const tick = () => {
    if (stop()) return;
    const p = (Date.now() - t0) / durationMs;
    if (p >= 1) return;
    if (p < 0.4) hap.light();
    else if (p < 0.75) hap.medium();
    else hap.heavy();
    setTimeout(tick, 420 - p * 330);
  };
  tick();
}
