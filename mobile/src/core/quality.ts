import { Platform } from 'react-native';

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

export const defaultQuality = (): Quality => (Platform.OS === 'web' ? 'medium' : 'high');
export const downgrade = (q: Quality): Quality => (q === 'high' ? 'medium' : 'low');
