import type { AudioRecorder } from 'expo-audio';
import { apiUrl, IDLE_MS, MAX_WISHES } from '@/core/config';
import { dclip, dlog } from '@/core/devlog';
import type { LineId } from '@/core/lines';
import { transition, type Event, type MachineState, type Phase } from '@/core/machine';
import { isInvocation, normalize } from '@/core/phrases';
import { hap, rampHaptics } from '@/audio/haptics';
import { ensureSfx, loadSfx, playSfx, stopAllSfx, stopSfx } from '@/audio/sfx';
import { ChatUnavailable, streamChat, type Turn } from '../conversation/chat';
import { checkBackend } from '../conversation/health';
import { Speaker } from '../speech/speaker';
import { deleteClip, isPromptEcho, looksLikeHallucination, SttUnavailable, transcribe } from '../voice/stt';
import { VoiceListener, type ClipInfo } from '../voice/listener';
import { micLevel, useStore } from './store';
import { loadHunt, newHunt, useHunt } from '../hunt/store';
import { tracker } from '../hunt/tracker';
import { RELEASE, TIMING } from './timing';


const MAX_HISTORY = 12;

class Controller {
  private voice: VoiceListener | null = null;
  private speaker = new Speaker({
    onPlay: () => {
      useStore.getState().set({ speaking: true });
      this.firstPlay?.();
    },
    onIdle: () => useStore.getState().set({ speaking: false }),
  });
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private history: Turn[] = [];
  private turn = 0; // invalida fluxos assíncronos antigos
  private chatAbort: AbortController | null = null;
  private firstPlay: (() => void) | null = null;
  private goodbyeFixed = true;
  private processing = false;
  private started = false;
  private hudAt = 0;

  private get m(): MachineState {
    return useStore.getState().m;
  }

  attach(recorder: AudioRecorder) {
    if (this.voice?.recorder === recorder) return;
    void this.voice?.stop(); // gravador antigo é liberado quando a tela que o criou desmonta
    this.voice = new VoiceListener(recorder);
  }

  // ───────────── entradas externas ─────────────
  /** Tela de abertura: tema de abertura em loop (volta a tocar se o app sair e voltar ainda nela). */
  openingMusic() {
    if (this.m.phase === 'boot') ensureSfx('opening', { loop: true, volume: 0.8 });
  }

  async start() {
    if (this.started || this.m.phase !== 'boot') return;
    this.started = true;
    stopSfx('opening', 1800);
    loadSfx();
    void this.refreshBackend();
    await loadHunt();
    const granted = await VoiceListener.requestPermission();
    useStore.getState().set({ micDenied: !granted });
    this.dispatch({ type: 'START' });
  }

  /** Toque longo nas esferas (fallback sem voz). */
  longPressInvoke() {
    if (this.m.phase === 'altar') this.invoke();
  }

  /** Toque na tela: interrompe a fala de Shenlong e volta a ouvir. */
  tap() {
    const { phase } = this.m;
    if (phase === 'speaking' || phase === 'thinking') {
      this.turn++;
      this.chatAbort?.abort();
      this.speaker.stop();
      this.processing = false;
      this.dispatch({ type: 'INTERRUPT' });
    } else if (phase === 'altar') {
      useStore.getState().bump('heard');
      hap.light();
    } else if (phase === 'listening' || phase === 'greeting') {
      useStore.getState().bump('poke');
      hap.light();
    }
  }

  /** As 7 esferas foram coletadas: vai ao altar (invocação por voz liberada). */
  huntComplete() {
    if (this.m.phase === 'hunt') this.dispatch({ type: 'ALL_FOUND' });
  }

  background() {
    // desejo já concedido e o app saiu no meio da despedida: as esferas se espalham do mesmo jeito
    const granted = this.m.wishes > 0 || this.m.phase === 'goodbye' || this.m.phase === 'disappearing';
    this.cancelAll();
    if (granted) this.scatterBalls();
    this.dispatch({ type: 'BACKGROUND' });
  }

  /** Espalha as 7 esferas de novo ao redor de onde a pessoa está agora. */
  private scatterBalls() {
    newHunt(tracker.lastFix);
    tracker.resetOrigin();
    useHunt.getState().set({ scatteredAt: Date.now() });
  }

  /** Atalho de debug: pula direto para uma fase (tela /debug). */
  debugGoto(phase: Phase, wishes = 0) {
    this.cancelAll();
    useStore.getState().set({ m: { phase, wishes, idlePrompts: 0 }, speaking: false });
    this.enter(phase, 'debug');
  }

  private async refreshBackend() {
    const b = await checkBackend();
    useStore.getState().set({ backend: b });
    dlog(`servidor ${apiUrl()} → ${JSON.stringify(b)}`);
  }

  // ───────────── núcleo ─────────────
  private dispatch(e: Event) {
    const prev = this.m;
    const next = transition(prev, e);
    if (next === prev) return;
    useStore.getState().set({ m: next });
    if (next.phase !== prev.phase || e.type === 'IDLE_TIMEOUT') this.enter(next.phase, e.type);
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private cancelAll() {
    this.turn++;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.chatAbort?.abort();
    this.speaker.stop();
    this.processing = false;
    void this.voice?.stop();
    stopAllSfx();
  }

  private bolt(big: boolean) {
    useStore.getState().bump('bolt', { boltBig: big });
    playSfx('thunder', { volume: big ? 1 : 0.6 });
    big ? hap.heavy() : hap.medium();
  }

  private enter(phase: Phase, cause: string) {
    const st = useStore.getState();
    const turnAtEnter = this.turn;
    const alive = () => turnAtEnter === this.turn && this.m.phase === phase;

    if (phase !== 'listening') this.clearIdle();
    if (phase !== 'altar' && phase !== 'listening') void this.voice?.stop();
    if (phase !== 'hunt') tracker.stop();

    switch (phase) {
      case 'hunt':
        // Radar do Dragão: o app vira um radar; o dragão (3D) pausa
        st.set({ speaking: false });
        stopAllSfx('opening');
        void tracker.start();
        break;

      case 'altar':
        void this.refreshBackend();
        stopAllSfx();
        playSfx('drone', { loop: true, volume: 0.5 });
        this.listen('invocation');
        break;

      case 'summoning': {
        this.history = [];
        playSfx('ping');
        hap.medium();
        stopSfx('drone', 2500);
        playSfx('rumble', { loop: true, volume: 0.8 });
        this.later(500, () => playSfx('charge'));
        rampHaptics(TIMING.summon * 0.8, () => !alive());
        this.later(1900, () => this.bolt(false));
        this.later(3100, () => this.bolt(false));
        this.later(TIMING.summon - 700, () => this.bolt(true));
        this.later(TIMING.summon - 600, () => playSfx('impact'));
        this.later(TIMING.summon, () => this.dispatch({ type: 'SUMMON_DONE' }));
        break;
      }

      case 'appearing':
        stopSfx('rumble', 3000);
        playSfx('roar');
        this.later(250, () => hap.heavy());
        this.later(1100, () => this.bolt(false));
        this.later(2300, () => hap.medium());
        this.later(2900, () => this.bolt(true));
        this.later(TIMING.appear - 600, () => hap.success());
        this.later(TIMING.appear, () => this.dispatch({ type: 'APPEAR_DONE' }));
        playSfx('drone', { loop: true, volume: 0.25 });
        break;

      case 'greeting':
        this.sayLine('greeting', () => alive(), () => this.dispatch({ type: 'GREETING_DONE' }));
        break;

      case 'listening':
        this.goodbyeFixed = true;
        if (cause !== 'debug') playSfx('listen', { volume: 0.5 });
        this.armIdle();
        this.listen('conversation');
        break;

      case 'thinking':
        break; // o fluxo do turno é conduzido por handleUtterance()

      case 'speaking':
        if (cause === 'IDLE_TIMEOUT') {
          this.sayLine('stillthere', () => alive(), () => this.dispatch({ type: 'REPLY_DONE', farewell: false }));
        }
        break;

      case 'goodbye':
        if (this.m.wishes > 0) {
          this.sayLine('farewell', () => alive(), () => this.dispatch({ type: 'GOODBYE_DONE' }));
        } else if (this.goodbyeFixed) {
          this.sayLine('goodbye', () => alive(), () => this.dispatch({ type: 'GOODBYE_DONE' }));
        } else {
          this.later(700, () => this.dispatch({ type: 'GOODBYE_DONE' }));
        }
        break;

      case 'disappearing': {
        this.history = [];
        const done = () => {
          this.scatterBalls(); // as esferas se espalham de novo pelo planeta
          this.dispatch({ type: 'DISAPPEAR_DONE' });
        };
        if (this.m.wishes > 0) {
          // desejo realizado: dourado → 7 esferas girando → um brilho → lançadas pelo planeta
          const at = (f: number, fn: () => void) => this.later(TIMING.release * f, fn);
          stopSfx('drone', 1500);
          playSfx('charge', { volume: 0.9 });
          rampHaptics(TIMING.release * RELEASE.burst, () => !alive());
          at(RELEASE.burst - 0.02, () => {
            playSfx('impact', { volume: 0.8 });
            playSfx('chime');
            hap.heavy();
          });
          at(RELEASE.merge - 0.12, () => playSfx('gather'));
          at(RELEASE.launch, () => {
            playSfx('thunder', { volume: 0.7 });
            hap.success();
          });
          [0, 1, 2].forEach((k) => at(RELEASE.launch + 0.02 + k * 0.05, () => playSfx('ping', { volume: 0.6 })));
          at(1, done);
        } else {
          playSfx('roar', { volume: 0.7 });
          this.later(300, () => this.bolt(true));
          this.later(TIMING.disappear - 800, () => hap.warning());
          this.later(TIMING.disappear, done);
        }
        break;
      }

      case 'boot':
        break;
    }
  }

  private async sayLine(id: LineId, alive: () => boolean, then: () => void) {
    this.speaker.begin();
    this.speaker.enqueueLine(id);
    await this.speaker.end();
    if (alive()) then();
  }

  // ───────────── escuta ─────────────
  private listen(mode: 'invocation' | 'conversation') {
    const st = useStore.getState();
    dlog(`escuta ${mode} (fase ${this.m.phase}, microfone ${st.micDenied ? 'NEGADO' : 'ok'}, gravador ${this.voice ? 'ok' : 'AUSENTE'})`);
    if (st.micDenied && mode === 'invocation') return; // só toque longo
    const myTurn = this.turn;
    if (__DEV__) st.set({ voiceState: 'ouvindo' });
    void this.voice?.start({
      onLevel: (l, db) => {
        micLevel.value = l;
        if (__DEV__) {
          const now = Date.now();
          if (now - this.hudAt > 300) {
            this.hudAt = now;
            useStore.getState().set({ micDb: Math.round(db) });
          }
        }
      },
      onSpeechStart: () => {
        if (__DEV__) useStore.getState().set({ voiceState: 'fala detectada' });
        if (mode === 'invocation') {
          useStore.getState().bump('heard'); // esferas acendem NA HORA, antes do STT
          hap.select();
        } else {
          this.armIdle(); // criança está falando: reinicia o contador de silêncio
        }
      },
      onClip: (clip) => {
        if (myTurn !== this.turn) {
          dlog('clipe IGNORADO: turno mudou');
          return;
        }
        void this.onClip(mode, clip);
      },
      onError: (msg) => {
        if (__DEV__) useStore.getState().set({ voiceState: `reabrindo microfone (${msg})` });
      },
    });
  }

  private async onClip(mode: 'invocation' | 'conversation', clip: ClipInfo) {
    if (this.processing) {
      dlog('clipe IGNORADO: ainda processando o anterior');
      return;
    }
    const phaseAtStart = this.m.phase;
    dlog(`clipe ${mode}: voz ${clip.voiceMs} ms, pico ${clip.peak.toFixed(2)}, fase ${phaseAtStart}`);
    if (__DEV__) useStore.getState().set({ voiceState: `fala ${clip.voiceMs} ms → reconhecendo…` });
    const offline = async () => {
      if (mode === 'invocation') {
        // sem STT (sem chave/sem rede): qualquer fala clara de ~0,5–5 s invoca — a criança sempre consegue
        const ok = clip.voiceMs >= 450 && clip.voiceMs <= 5500 && clip.peak > 0.3;
        dlog(`offline: ${ok ? 'invoca' : 'NAO invoca (precisa voz 450–5500 ms e pico > 0.30)'}`);
        if (ok) this.invoke();
        else useStore.getState().bump('missed');
      } else if (this.m.phase === 'listening') {
        await this.failTurn('offline');
      }
    };
    if (!useStore.getState().backend.stt) {
      dlog('STT indisponivel (servidor fora do ar ou sem chave): modo offline');
      deleteClip(clip.uri);
      void this.refreshBackend();
      await offline();
      return;
    }
    let text = '';
    dclip(clip.uri);
    const t0 = Date.now();
    try {
      text = await transcribe(clip.uri);
    } catch (e) {
      dlog(`STT FALHOU em ${Date.now() - t0} ms: ${String(e).slice(0, 160)}`);
      if (__DEV__) useStore.getState().set({ voiceState: `reconhecimento falhou (${String(e).slice(0, 60)})` });
      if (e instanceof SttUnavailable) await offline();
      return;
    }
    dlog(`STT ${Date.now() - t0} ms: "${text}"`);
    if (__DEV__) useStore.getState().set({ voiceState: `ouvi: "${text.slice(0, 50)}"` });
    if (!isPromptEcho(text)) useStore.getState().set({ lastHeard: text });
    if (this.m.phase !== phaseAtStart) {
      dlog(`descartado: fase mudou de ${phaseAtStart} para ${this.m.phase} durante o STT`);
      return;
    }
    if (looksLikeHallucination(text, clip.voiceMs)) {
      dlog('descartado: parece alucinacao do STT');
      if (mode === 'invocation') useStore.getState().bump('missed');
      return;
    }
    if (isPromptEcho(text)) {
      // o STT devolve a dica do prompt para silêncio/ruído/fala cortada: equivale a "não entendi"
      dlog('STT devolveu a dica do prompt (audio sem fala clara)');
      if (mode === 'invocation') await offline();
      return;
    }
    if (mode === 'invocation') {
      const ok = isInvocation(text);
      dlog(ok ? 'INVOCACAO reconhecida' : `nao e invocacao: "${normalize(text)}"`);
      if (ok) this.invoke();
      else useStore.getState().bump('missed');
    } else {
      void this.handleUtterance(text);
    }
  }

  private invoke() {
    if (this.m.phase !== 'altar') {
      dlog(`invocacao ignorada: fase ${this.m.phase} (so vale no altar)`);
      return;
    }
    void this.voice?.stop();
    this.dispatch({ type: 'INVOKE' });
  }

  // ───────────── conversa ─────────────
  private clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
  private armIdle() {
    this.clearIdle();
    this.idleTimer = setTimeout(() => this.dispatch({ type: 'IDLE_TIMEOUT' }), IDLE_MS);
  }

  private async failTurn(kind: 'offline' | 'notheard') {
    const myTurn = ++this.turn;
    this.processing = true;
    this.goodbyeFixed = kind !== 'offline'; // 'offline' já é uma despedida em personagem
    void this.voice?.stop();
    this.dispatch({ type: 'UTTERANCE' });
    this.dispatch({ type: 'REPLY_FAILED' });
    this.speaker.begin();
    this.speaker.enqueueLine(kind);
    await this.speaker.end();
    this.processing = false;
    if (myTurn !== this.turn) return;
    this.dispatch({ type: 'REPLY_DONE', farewell: kind === 'offline' });
  }

  private async handleUtterance(text: string) {
    if (this.processing || this.m.phase !== 'listening') return;
    this.processing = true;
    const myTurn = ++this.turn;
    void this.voice?.stop();
    this.dispatch({ type: 'UTTERANCE' });

    this.history.push({ role: 'user', content: text });
    this.history = this.history.slice(-MAX_HISTORY);

    const abort = new AbortController();
    this.chatAbort = abort;
    this.speaker.begin();

    let started = false;
    let farewell = false;
    let reply = '';
    this.firstPlay = () => {
      if (!started && myTurn === this.turn) {
        started = true;
        this.dispatch({ type: 'REPLY_STARTED' });
      }
    };
    // cobre a latência: se a IA demorar, Shenlong "pensa em voz alta"
    this.later(1300, () => {
      if (myTurn === this.turn && !started && !reply) this.speaker.enqueueLine(Math.random() < 0.5 ? 'thinking1' : 'thinking2');
    });

    try {
      await streamChat(this.history, this.m.wishes, abort.signal, (ev) => {
        if (myTurn !== this.turn) return;
        if (ev.t === 'flag' && ev.v === 'concedido') {
          useStore.setState((s) => ({ m: { ...s.m, wishes: s.m.wishes + 1 } }));
          useStore.getState().bump('wish');
          playSfx('chime');
          hap.success();
        } else if (ev.t === 'flag' && ev.v === 'adeus') farewell = true;
        else if (ev.t === 'sentence') {
          reply += (reply ? ' ' : '') + ev.text;
          this.speaker.enqueue(ev.text);
        } else if (ev.t === 'error' && !reply) throw new ChatUnavailable('stream error');
      });
      if (myTurn !== this.turn) return;
      if (!reply) throw new ChatUnavailable('empty reply');
      await this.speaker.end();
      if (myTurn !== this.turn) return;
      this.history.push({ role: 'assistant', content: reply });
      this.processing = false;
      this.goodbyeFixed = false; // o modelo já se despediu
      this.dispatch({ type: 'REPLY_DONE', farewell: farewell || this.m.wishes >= MAX_WISHES });
    } catch (e) {
      if (myTurn !== this.turn) return;
      this.processing = false;
      this.speaker.stop();
      this.history.pop();
      await this.failTurn(e instanceof ChatUnavailable ? 'offline' : 'notheard');
    } finally {
      this.firstPlay = null;
    }
  }
}

export const controller = new Controller();
