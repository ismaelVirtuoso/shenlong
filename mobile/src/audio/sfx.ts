import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  drone: require('../../assets/sfx/drone.wav'),
  rumble: require('../../assets/sfx/rumble.wav'),
  charge: require('../../assets/sfx/charge.wav'),
  thunder: require('../../assets/sfx/thunder.wav'),
  thunderB: require('../../assets/sfx/thunder.wav'), // 2º player p/ trovões sobrepostos
  impact: require('../../assets/sfx/impact.wav'),
  roar: require('../../assets/sfx/roar.wav'),
  chime: require('../../assets/sfx/chime.wav'),
  ping: require('../../assets/sfx/ping.wav'),
  listen: require('../../assets/sfx/listen.wav'),
} as const;

export type SfxName = keyof typeof SOURCES;

const players = new Map<SfxName, AudioPlayer>();
const fades = new Map<SfxName, ReturnType<typeof setInterval>>();
let thunderFlip = false;

function get(name: SfxName): AudioPlayer | undefined {
  try {
    let p = players.get(name);
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      players.set(name, p);
    }
    return p;
  } catch {
    return undefined;
  }
}

export function loadSfx() {
  (Object.keys(SOURCES) as SfxName[]).forEach(get);
}

export function playSfx(name: SfxName, opts: { volume?: number; loop?: boolean } = {}) {
  const key: SfxName = name === 'thunder' ? ((thunderFlip = !thunderFlip) ? 'thunder' : 'thunderB') : name;
  const p = get(key);
  if (!p) return;
  try {
    clearInterval(fades.get(key));
    p.loop = !!opts.loop;
    p.volume = opts.volume ?? 1;
    p.seekTo(0);
    p.play();
  } catch {}
}

export function stopSfx(name: SfxName, fadeMs = 0) {
  const p = players.get(name);
  if (!p) return;
  clearInterval(fades.get(name));
  if (fadeMs <= 0) {
    try { p.pause(); } catch {}
    return;
  }
  const start = p.volume;
  const t0 = Date.now();
  fades.set(
    name,
    setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / fadeMs);
      try { p.volume = start * (1 - k); } catch {}
      if (k >= 1) {
        clearInterval(fades.get(name));
        try { p.pause(); } catch {}
      }
    }, 50),
  );
}

export function stopAllSfx() {
  (Object.keys(SOURCES) as SfxName[]).forEach((n) => stopSfx(n));
}
