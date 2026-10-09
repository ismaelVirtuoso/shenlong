// Prévia da arte vetorial: gera SVG da cabeça (mesmas camadas usadas no app) e renderiza PNG.
//   npx tsx tools/art/preview.ts out.svg [jaw=0..1]
import { writeFileSync } from 'node:fs';
import { ANCHORS, EYE, HEAD_LAYERS, JAW_TOP, MOUTH_TOP } from '../../mobile/src/features/scene/art/head';

const out = process.argv[2] ?? '/tmp/head.svg';
const jaw = Number(process.argv[3] ?? 0);
const drop = jaw * 90;
const bg = process.argv[4] ?? '#9bdc4a';
const body = HEAD_LAYERS.map((l) => {
  const t = l.part === 'jaw' ? `transform="translate(0 ${drop})"` : l.part === 'mouth' ? `transform="translate(0 ${MOUTH_TOP}) scale(1 ${1 + drop / (JAW_TOP + 40 - MOUTH_TOP)}) translate(0 ${-MOUTH_TOP})"` : '';
  return `<path d="${l.d}" fill="${l.fill ?? 'none'}" stroke="${l.stroke ?? 'none'}" stroke-width="${l.sw ?? 0}" stroke-linejoin="round" stroke-linecap="round" ${t}/>`;
}).join('\n');
// olhos acesos (o app faz isso com brilho animado)
const eyes = [ANCHORS.eyeR, ANCHORS.eyeL].map(([x, y]) => `
  <ellipse cx="${x}" cy="${y}" rx="${EYE.rx * 1.6}" ry="${EYE.ry * 2.2}" fill="url(#glow)" transform="rotate(${x > 500 ? -17 : 17} ${x} ${y})"/>
  <ellipse cx="${x}" cy="${y}" rx="${EYE.rx * 0.95}" ry="${EYE.ry * 0.85}" fill="url(#iris)" transform="rotate(${x > 500 ? -17 : 17} ${x} ${y})"/>`).join('');
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<defs>
  <radialGradient id="glow"><stop offset="0" stop-color="#ff3a1a" stop-opacity="0.9"/><stop offset="1" stop-color="#ff2000" stop-opacity="0"/></radialGradient>
  <radialGradient id="iris"><stop offset="0" stop-color="#fff4b0"/><stop offset="0.35" stop-color="#ff5a24"/><stop offset="1" stop-color="#d60d08"/></radialGradient>
</defs>
<rect width="1000" height="1000" fill="${bg}"/>
${body}
${eyes}
</svg>`);
console.log(out);
