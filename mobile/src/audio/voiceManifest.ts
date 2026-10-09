// Vazio até rodar `npm run gen:voice` em server/ (gera os mp3 e reescreve este arquivo).
import type { LineId } from '../core/lines';

export const VOICE: Partial<Record<LineId, number>> = {};
