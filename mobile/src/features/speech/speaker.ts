import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { apiUrl } from '@/core/config';
import { LINES, type LineId } from '@/core/lines';
import { VOICE } from '@/audio/voiceManifest';

/**
 * Fallback sem servidor de voz: voz do aparelho. Preferimos uma voz pt-BR masculina
 * (iOS: Felipe; Android/Google: ptd/pte); a padrão do iPhone (Luciana) é feminina.
 */
let deviceVoice: string | undefined;
let deviceVoiceLoaded = false;
async function pickDeviceVoice() {
  if (deviceVoiceLoaded) return deviceVoice;
  deviceVoiceLoaded = true;
  try {
    const voices = (await Speech.getAvailableVoicesAsync()).filter((v) => /^pt[-_]BR/i.test(v.language));
    const male = voices.find((v) => /felipe|ptd|pte|male|masculin|ricardo|daniel/i.test(`${v.name} ${v.identifier}`));
    deviceVoice = (male ?? voices.find((v) => /enhanced|premium/i.test(v.quality ?? '')))?.identifier;
  } catch {}
  return deviceVoice;
}

type Playable = { kind: 'file'; uri: string | number } | { kind: 'device'; text: string };
interface Item {
  text: string;
  ready: Promise<Playable>;
}

export interface SpeakerEvents {
  /** começou a tocar uma frase (boca/olhos; sem legenda: Shenlong só fala) */
  onPlay: (text: string) => void;
  /** a fila esvaziou ou foi interrompida */
  onIdle: () => void;
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

async function fetchTts(text: string, signal: AbortSignal): Promise<Playable> {
  if (Platform.OS === 'web') {
    const res = await fetch(`${apiUrl()}/api/tts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal,
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    return { kind: 'file', uri: URL.createObjectURL(await res.blob()) };
  }
  const cached = [new File(Paths.cache, `tts-${hash(text)}.mp3`), new File(Paths.cache, `tts-${hash(text)}.wav`)].find((f) => f.exists);
  if (cached) return { kind: 'file', uri: cached.uri };
  const res = await fetch(`${apiUrl()}/api/tts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal,
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const ext = (res.headers.get('content-type') ?? '').includes('wav') ? 'wav' : 'mp3';
  const file = new File(Paths.cache, `tts-${hash(text)}.${ext}`);
  file.write(new Uint8Array(await res.arrayBuffer()));
  return { kind: 'file', uri: file.uri };
}

/**
 * Fila de falas de Shenlong. Cada frase começa a ser sintetizada assim que entra na fila
 * (em paralelo) e toca em ordem — a 1ª frase sai enquanto o LLM ainda escreve as próximas.
 */
export class Speaker {
  private queue: Item[] = [];
  private running = false;
  private finished = true;
  private ctrl = new AbortController();
  private player: AudioPlayer | null = null;
  private resolvers: (() => void)[] = [];
  private stopped = false;
  private ttsDown = false;
  private gen = 0;
  private cancelPlay: (() => void) | null = null;

  constructor(private ev: SpeakerEvents) {}

  /** Começa um novo "turno de fala"; chame enqueue() N vezes e depois end(). */
  begin() {
    this.stop();
    this.ctrl = new AbortController();
    this.stopped = false;
    this.finished = false;
  }

  enqueue(text: string) {
    if (this.stopped) return;
    this.queue.push({ text, ready: this.prepare(text) });
    void this.run();
  }

  enqueueLine(id: LineId) {
    if (this.stopped) return;
    const asset = VOICE[id];
    const text = LINES[id];
    this.queue.push({ text, ready: asset ? Promise.resolve({ kind: 'file', uri: asset }) : this.prepare(text) });
    void this.run();
  }

  /** Sem mais frases: resolve quando tudo terminou de tocar. */
  end(): Promise<void> {
    this.finished = true;
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((r) => this.resolvers.push(r));
  }

  stop() {
    this.stopped = true;
    this.finished = true;
    this.gen++;
    this.running = false;
    this.ctrl.abort();
    this.queue = [];
    try { Speech.stop(); } catch {}
    try { this.player?.pause(); this.player?.remove(); } catch {}
    this.player = null;
    this.cancelPlay?.();
    this.cancelPlay = null;
    this.resolvers.splice(0).forEach((r) => r());
    this.ev.onIdle();
  }

  private prepare(text: string): Promise<Playable> {
    if (this.ttsDown) return Promise.resolve({ kind: 'device', text });
    return fetchTts(text, this.ctrl.signal).catch(() => {
      if (!this.ctrl.signal.aborted) this.ttsDown = true; // 1ª falha: resto do turno usa a voz do aparelho
      return { kind: 'device', text } as Playable;
    });
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    const g = this.gen;
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
    while (g === this.gen && !this.stopped) {
      const item = this.queue.shift();
      if (!item) {
        if (this.finished) break;
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      const playable = await item.ready;
      if (g !== this.gen || this.stopped) break;
      this.ev.onPlay(item.text);
      await this.play(playable);
    }
    if (g !== this.gen) return; // interrompido: stop() já limpou tudo
    this.running = false;
    this.ev.onIdle();
    this.settle();
  }

  private settle() {
    if (this.running || this.queue.length) return;
    this.resolvers.splice(0).forEach((r) => r());
  }

  private play(p: Playable): Promise<void> {
    return new Promise<void>((resolve) => {
      if (p.kind === 'device') {
        this.cancelPlay = resolve;
        void pickDeviceVoice().then((voice) =>
          Speech.speak(p.text, {
            language: 'pt-BR', voice, pitch: 0.5, rate: 0.78,
            onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve(),
          }),
        );
        return;
      }
      try {
        const player = createAudioPlayer(p.uri, { keepAudioSessionActive: true });
        this.player = player;
        const sub = player.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish) done();
        });
        const guard = setTimeout(done, 20000);
        this.cancelPlay = done;
        function done() {
          clearTimeout(guard);
          sub.remove();
          try { player.remove(); } catch {}
          resolve();
        }
        player.play();
      } catch {
        resolve();
      }
    });
  }
}
