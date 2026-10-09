/**
 * Pré-gera as frases fixas de Shenlong (latência zero, funcionam offline).
 *   cd server && npm run gen:voice
 * Escreve mobile/assets/voice/<id>.mp3 e mobile/src/audio/voiceManifest.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LINES } from '../../mobile/src/core/lines';
import { ttsAvailable, ttsEngine, synthesize } from '../src/providers/tts.js';

if (!ttsAvailable()) {
  console.error('Nenhuma voz disponível: rode `make voice-setup` (Piper, grátis) ou defina OPENAI_API_KEY em server/.env.');
  process.exit(1);
}
console.log(`voz: ${ttsEngine()} + efeito dragão`);
const outDir = resolve(import.meta.dirname, '../../mobile/assets/voice');
mkdirSync(outDir, { recursive: true });

const ids = Object.keys(LINES) as (keyof typeof LINES)[];
for (const id of ids) {
  const audio = await synthesize(LINES[id]);
  writeFileSync(resolve(outDir, `${id}.mp3`), audio);
  console.log('ok', id);
}
const body = ids.map((id) => `  ${id}: require('../../assets/voice/${id}.mp3') as number,`).join('\n');
writeFileSync(
  resolve(import.meta.dirname, '../../mobile/src/audio/voiceManifest.ts'),
  `// GERADO por server/scripts/gen-voice.ts\nimport type { LineId } from '../core/lines';\n\nexport const VOICE: Partial<Record<LineId, number>> = {\n${body}\n};\n`,
);
console.log('manifest escrito');
