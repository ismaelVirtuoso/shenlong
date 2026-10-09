import { Platform } from 'react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

export interface ClipInfo {
  uri: string;
  /** ms de voz detectada dentro do clipe */
  voiceMs: number;
  /** maior nível (0..1) do clipe */
  peak: number;
}

export interface ListenHandlers {
  /** nível 0..1 e dBFS bruto (diagnóstico) */
  onLevel: (level: number, db: number) => void;
  onSpeechStart: () => void;
  onClip: (clip: ClipInfo) => void;
}

const TICK = 60;
const END_SILENCE = 700;
const MAX_SPEECH = 6500;
/**
 * Reabrir o gravador reconfigura a sessão de áudio do iOS (setCategory/setActive): estala o som
 * (o "chiado" a cada poucos segundos) e engasga a animação. Então só reabrimos após uma fala ou
 * a cada 25 s de silêncio (para o arquivo não crescer à toa — 25 s a 32 kbps ≈ 100 KB).
 */
const ROTATE_IDLE = 25000;
const MIN_VOICE_DB = -46;

const toLevel = (db: number) => Math.min(1, Math.max(0, (db + 55) / 40));

/**
 * Escuta contínua com VAD local: mede o nível do microfone (metering), reage no INÍCIO da fala
 * (feedback visual imediato) e entrega um clipe curto no FIM da fala para o STT.
 * Half-duplex: só roda enquanto Shenlong não está falando (evita eco).
 */
export class VoiceListener {
  private active = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private h: ListenHandlers | null = null;

  constructor(private recorder: AudioRecorder) {}

  static async requestPermission(): Promise<boolean> {
    try {
      return (await requestRecordingPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  async start(h: ListenHandlers) {
    if (this.active) return;
    this.active = true;
    this.h = h;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch {}
    void this.segment();
  }

  async stop() {
    this.active = false;
    this.h?.onLevel(0, -160);
    this.h = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      if (this.recorder.isRecording) await this.recorder.stop();
    } catch {}
  }

  private async segment() {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      await this.recorder.prepareToRecordAsync();
      if (!this.active) return;
      this.recorder.record();
    } catch {
      this.busy = false;
      setTimeout(() => void this.segment(), 800); // tenta de novo (ex.: permissão acabou de ser dada)
      return;
    }
    this.busy = false;

    const t0 = Date.now();
    let floor = -58; // ruído ambiente (média móvel)
    let speaking = false;
    let speechStart = 0;
    let lastVoice = 0;
    let voiceMs = 0;
    let peak = 0;
    let smooth = 0;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.active || !this.h) return;
      const now = Date.now();
      const db = this.recorder.getStatus().metering ?? -160;
      const level = toLevel(db);
      smooth += (level - smooth) * 0.5;
      this.h.onLevel(smooth, db);
      peak = Math.max(peak, level);

      const isVoice = db > Math.max(floor + 8, MIN_VOICE_DB);
      if (!isVoice) floor += (Math.max(db, -80) - floor) * 0.05;

      if (isVoice) {
        voiceMs += TICK;
        lastVoice = now;
        if (!speaking && voiceMs >= 120) {
          speaking = true;
          speechStart = now;
          this.h.onSpeechStart();
        }
      }
      const endedSpeech = speaking && now - lastVoice > END_SILENCE;
      const tooLong = speaking && now - speechStart > MAX_SPEECH;
      const idleRotate = !speaking && now - t0 > ROTATE_IDLE;
      if (endedSpeech || tooLong || idleRotate) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        void this.finish(speaking, voiceMs, peak);
      }
    }, TICK);
  }

  private async finish(send: boolean, voiceMs: number, peak: number) {
    const h = this.h;
    let uri: string | null = null;
    try {
      await this.recorder.stop();
      uri = this.recorder.uri;
    } catch {}
    // O gravador reutiliza o MESMO arquivo a cada segmento: move a fala para um nome único
    // antes de reabrir a gravação (senão o envio ao STT lia um arquivo sendo regravado/apagado).
    if (send && uri && Platform.OS !== 'web') {
      try {
        const src = new File(uri);
        const dst = new File(Paths.cache, `fala-${Date.now()}.m4a`);
        await src.move(dst);
        uri = dst.uri;
      } catch {
        send = false;
      }
    }
    if (this.active) void this.segment(); // reabre já (não perde o começo da próxima fala)
    if (send && uri && h) h.onClip({ uri, voiceMs, peak });
  }
}
