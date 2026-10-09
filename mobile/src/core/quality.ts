import { Platform } from 'react-native';
import * as Device from 'expo-device';

export type Quality = 'high' | 'medium' | 'low';

export interface QualityProfile {
  particles: number;
  segments: number;
  clouds: number;
  blur: boolean;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  high: { particles: 140, segments: 72, clouds: 9, blur: true },
  medium: { particles: 90, segments: 56, clouds: 6, blur: true },
  low: { particles: 40, segments: 40, clouds: 3, blur: false },
};

/** Aparelho de entrada (ex.: Galaxy A11: 2–3 GB de RAM, Adreno 506) → perfil leve. */
export function isLowEnd(): boolean {
  if (Platform.OS !== 'android') return false;
  const mem = Device.totalMemory ?? 0;
  const year = Device.deviceYearClass ?? 2020;
  return (mem > 0 && mem < 4.5e9) || year < 2019;
}

export const defaultQuality = (): Quality => (Platform.OS === 'web' ? 'medium' : isLowEnd() ? 'low' : 'high');
export const downgrade = (q: Quality): Quality => (q === 'high' ? 'medium' : 'low');
