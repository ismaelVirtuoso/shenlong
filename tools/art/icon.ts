// Ícone do app no estilo anime (mesma arte vetorial do app): cabeça do Shenlong com olhos acesos,
// aura verde-limão, raios de luz e a esfera de 4 estrelas.
//   npx tsx tools/art/icon.ts out.svg [padding 0..0.3]
import { writeFileSync } from 'node:fs';
import { ANCHORS, EYE, HEAD_LAYERS, JAW_TOP, MOUTH_TOP } from '../../mobile/src/features/scene/art/head';

const out = process.argv[2] ?? '/tmp/icon.svg';
const pad = Number(process.argv[3] ?? 0); // respiro extra (ícone adaptativo do Android)
const open = 0.45, drop = open * 95;
const layer = HEAD_LAYERS.map((l) => {
  const t = l.part === 'jaw' ? `transform="translate(0 ${drop})"` : l.part === 'mouth' ? `transform="translate(0 ${MOUTH_TOP}) scale(1 ${1 + drop / (JAW_TOP + 40 - MOUTH_TOP)}) translate(0 ${-MOUTH_TOP})"` : '';
  return `<path d="${l.d}" fill="${l.fill ?? 'none'}" stroke="${l.stroke ?? 'none'}" stroke-width="${l.sw ?? 0}" stroke-linejoin="round" stroke-linecap="round" ${t}/>`;
}).join('');
const eyes = [ANCHORS.eyeR, ANCHORS.eyeL].map(([x, y], i) => {
  const rot = ((i ? -EYE.rot : EYE.rot) * 180) / Math.PI;
  return `<circle cx="${x}" cy="${y}" r="${EYE.rx * 2.6}" fill="url(#halo)" style="mix-blend-mode:screen"/>
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <ellipse rx="${EYE.rx * 3}" ry="9" fill="url(#glint)" style="mix-blend-mode:screen"/>
    <ellipse rx="${EYE.rx * 0.92}" ry="${EYE.ry * 0.82}" fill="url(#iris)" stroke="#0c1d0e" stroke-width="5"/>
    <ellipse rx="${EYE.rx * 0.45}" ry="${EYE.ry * 0.3}" fill="#fffbe8" opacity="0.9"/>
  </g>`;
}).join('');
const rays = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2, da = 0.06 + 0.05 * (i % 3);
  const R = 900;
  return `<path d="M500 470 L${500 + Math.cos(a - da) * R} ${470 + Math.sin(a - da) * R} L${500 + Math.cos(a + da) * R} ${470 + Math.sin(a + da) * R}Z" fill="url(#ray)"/>`;
}).join('');
const star = (cx: number, cy: number, r: number) =>
  `<path d="${Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.42 : r; return `${k ? 'L' : 'M'}${cx + Math.cos(a) * rr} ${cy + Math.sin(a) * rr}`; }).join('')}Z" fill="#d81b14"/>`;
// cabeça ocupa o quadro; esfera em primeiro plano, canto inferior esquerdo
const s = (1 - pad * 1.6) * 0.9;
const head = `<g transform="translate(${500 - 500 * s} ${30 + pad * 260}) scale(${s})">${layer}${eyes}</g>`;
const bs = 1 - pad;
const ball = `<g transform="translate(${215 + pad * 120} ${790 - pad * 110}) scale(${bs})">
  <circle r="210" fill="url(#ballGlow)"/>
  <circle r="150" fill="url(#ball)" stroke="#5a2104" stroke-width="7"/>
  ${star(-48, -38, 32)}${star(48, -38, 32)}${star(-48, 46, 32)}${star(48, 46, 32)}
  <ellipse cx="-62" cy="-82" rx="46" ry="24" fill="#ffffff" opacity="0.6" transform="rotate(-30 -62 -82)"/>
</g>`;
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1024" height="1024">
<defs>
  <radialGradient id="bg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#e8ff8a"/><stop offset="0.3" stop-color="#9be43c"/><stop offset="0.65" stop-color="#2f7d22"/><stop offset="1" stop-color="#0b2a0e"/></radialGradient>
  <radialGradient id="ray"><stop offset="0" stop-color="#ffffd8" stop-opacity="0.55"/><stop offset="1" stop-color="#d8ff70" stop-opacity="0"/></radialGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#ff5a3a" stop-opacity="1"/><stop offset="0.3" stop-color="#ff1a0a" stop-opacity="0.75"/><stop offset="1" stop-color="#c00000" stop-opacity="0"/></radialGradient>
  <radialGradient id="glint"><stop offset="0" stop-color="#ffe6c8" stop-opacity="0.95"/><stop offset="0.5" stop-color="#ff5030" stop-opacity="0.5"/><stop offset="1" stop-color="#ff2010" stop-opacity="0"/></radialGradient>
  <radialGradient id="iris"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#ff3a22"/><stop offset="1" stop-color="#a80606"/></radialGradient>
  <radialGradient id="ball" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.3" stop-color="#ffb32a"/><stop offset="0.75" stop-color="#ec6a0c"/><stop offset="1" stop-color="#9a3404"/></radialGradient>
  <radialGradient id="ballGlow"><stop offset="0.6" stop-color="#ffb030" stop-opacity="0.7"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1000" height="1000" fill="url(#bg)"/>
${rays}
${head}
${ball}
</svg>`);
console.log(out);
