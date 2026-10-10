import { Platform } from 'react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { dlog } from '../../core/devlog';

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
  /** falha ao abrir o gravador (diagnóstico; a escuta tenta de novo sozinha) */
  onError?: (msg: string) => void;
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
/**
 * Gravação "morta": o sistema parou a captura (iOS: sessão de áudio desativada por um efeito sonoro
 * que terminou, interrupção, rota trocada) ou o nível ficou em −160 dB (sem amostras). Reabre.
 */
const DEAD_MS = 2500;

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

  constructor(readonly recorder: AudioRecorder) {}

  static async requestPermission(): Promise<boolean> {
    try {
      return (await requestRecordingPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  async start(h: ListenHandlers) {
    this.h = h;
    if (this.active) return;
    this.active = true;
    this.failures = 0;
    await this.ensureMode();
    void this.segment();
  }

  async stop() {
    this.active = false;
    this.h?.onLevel(0, -160);
    this.h = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.release();
  }

  private failures = 0;

  /** iOS: a fala de Shenlong troca a sessão para "só reprodução"; sem isso o record() é recusado. */
  private async ensureMode() {
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch {}
  }

  /**
   * Para e libera o gravador mesmo que só esteja "preparado": no Android um gravador preparado e
   * não iniciado faz o próximo prepareToRecordAsync() falhar (AlreadyPrepared) para sempre.
   */
  private async release() {
    try {
      await this.recorder.stop();
    } catch {}
  }

  private async segment() {
    if (!this.active || this.busy) return;
    this.busy = true;
    let ok = false;
    try {
      await this.recorder.prepareToRecordAsync();
      if (!this.active) {
        await this.release();
        return;
      }
      this.recorder.record();
      ok = true;
    } catch (e) {
      this.failures++;
      dlog(`mic: falha ao abrir #${this.failures}: ${String((e as Error)?.message ?? e)}`);
      this.h?.onError?.(String((e as Error)?.message ?? e));
      await this.release();
      // tenta de novo (permissão recém-concedida, sessão de áudio ocupada); reafirma o modo de gravação
      setTimeout(() => {
        if (!this.active) return;
        void this.ensureMode().then(() => this.segment());
      }, Math.min(4000, 600 * this.failures));
    } finally {
      this.busy = false;
    }
    if (!ok || !this.active) return;
    this.failures = 0;

    const t0 = Date.now();
    let floor = -58; // ruído ambiente (média móvel)
    let speaking = false;
    let speechStart = 0;
    let lastVoice = 0;
    let voiceMs = 0;
    let peak = 0;
    let smooth = 0;
    let lastAlive = t0;
    let winMax = -160;
    let winMin = 0;
    let winRec = 0;
    let winTicks = 0;
    dlog('mic: gravando');

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.active || !this.h) return;
      const now = Date.now();
      let st: { isRecording: boolean; metering?: number };
      try {
        st = this.recorder.getStatus();
      } catch {
        st = { isRecording: false };
      }
      const db = st.metering ?? -160;
      if (st.isRecording && db > -159) lastAlive = now;
      winMax = Math.max(winMax, db);
      winMin = Math.min(winMin, db);
      if (st.isRecording) winRec++;
      if (++winTicks * TICK >= 2000) {
        dlog(`mic: nivel ${winMin.toFixed(0)}..${winMax.toFixed(0)} dB, chao ${floor.toFixed(0)}, gravando ${winRec}/${winTicks}`);
        winMax = -160;
        winMin = 0;
        winRec = winTicks = 0;
      }
      if (now - lastAlive > DEAD_MS) {
        // captura morreu (sessão desativada/interrompida): reabre sem enviar nada
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        dlog(`mic: REABRINDO (${st.isRecording ? 'gravando mas metering -160' : 'gravação parou'}; fala em curso: ${speaking})`);
        this.h.onError?.(st.isRecording ? 'sem sinal do microfone' : 'gravação interrompida');
        void this.finish(false, 0, 0, true);
        return;
      }
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
          dlog(`mic: inicio de fala (${db.toFixed(0)} dB, chao ${floor.toFixed(0)})`);
          this.h.onSpeechStart();
        }
      }
      const endedSpeech = speaking && now - lastVoice > END_SILENCE;
      const tooLong = speaking && now - speechStart > MAX_SPEECH;
      const idleRotate = !speaking && now - t0 > ROTATE_IDLE;
      if (endedSpeech || tooLong || idleRotate) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (speaking) {
          dlog(`mic: fim de fala (${endedSpeech ? 'silencio' : 'limite 6,5 s'}) voz ${voiceMs} ms, pico ${peak.toFixed(2)}`);
        }
        void this.finish(speaking, voiceMs, peak);
      }
    }, TICK);
  }

  private async finish(send: boolean, voiceMs: number, peak: number, dead = false) {
    const h = this.h;
    let uri: string | null = null;
    try {
      await this.recorder.stop();
      uri = this.recorder.uri;
    } catch {}
    // segmento sem fala: apaga já (no Android cada segmento é um arquivo novo no cache)
    if ((!send || dead) && uri && Platform.OS !== 'web') {
      try { new File(uri).delete(); } catch {}
    }
    if (dead) {
      if (this.active) await this.ensureMode();
      if (this.active) void this.segment();
      return;
    }
    // O gravador reutiliza o MESMO arquivo a cada segmento: move a fala para um nome único
    // antes de reabrir a gravação (senão o envio ao STT lia um arquivo sendo regravado/apagado).
    if (send && uri && Platform.OS !== 'web') {
      try {
        const src = new File(uri);
        const dst = new File(Paths.cache, `fala-${Date.now()}.m4a`);
        await src.move(dst);
        uri = dst.uri;
      } catch (e) {
        dlog(`mic: clipe DESCARTADO, falha ao mover arquivo: ${String(e).slice(0, 120)}`);
        send = false;
      }
    } else if (send && !uri) {
      dlog('mic: clipe DESCARTADO, gravador sem arquivo');
    }
    if (this.active) void this.segment(); // reabre já (não perde o começo da próxima fala)
    if (send && uri && h) h.onClip({ uri, voiceMs, peak });
  }
}
