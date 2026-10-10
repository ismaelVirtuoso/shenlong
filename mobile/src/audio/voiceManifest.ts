// GERADO por server/scripts/gen-voice.ts
import type { LineId } from '../core/lines';

export const VOICE: Partial<Record<LineId, number>> = {
  greeting: require('../../assets/voice/greeting.mp3') as number,
  notheard: require('../../assets/voice/notheard.mp3') as number,
  stillthere: require('../../assets/voice/stillthere.mp3') as number,
  goodbye: require('../../assets/voice/goodbye.mp3') as number,
  farewell: require('../../assets/voice/farewell.mp3') as number,
  offline: require('../../assets/voice/offline.mp3') as number,
  thinking1: require('../../assets/voice/thinking1.mp3') as number,
  thinking2: require('../../assets/voice/thinking2.mp3') as number,
};
