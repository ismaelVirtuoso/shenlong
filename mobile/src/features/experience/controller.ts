import type { AudioRecorder } from 'expo-audio';
import { IDLE_MS, MAX_WISHES } from '@/core/config';
import type { LineId } from '@/core/lines';
import { transition, type Event, type MachineState, type Phase } from '@/core/machine';
import { isInvocation } from '@/core/phrases';
import { hap, rampHaptics } from '@/audio/haptics';
import { loadSfx, playSfx, stopAllSfx, stopSfx } from '@/audio/sfx';
import { ChatUnavailable, streamChat, type Turn } from '../conversation/chat';
import { Speaker } from '../speech/speaker';
import { looksLikeHallucination, SttUnavailable, transcribe } from '../voice/stt';
import { VoiceListener, type ClipInfo } from '../voice/listener';
import { micLevel, useStore } from './store';
import { TIMING } from './timing';


const MAX_HISTORY = 12;

class Controller {
  private voice: VoiceListener | null = null;
  private speaker = new Speaker({
    onPlay: (text) => {
      useStore.getState().set({ speaking: true, caption: { id: Date.now(), who: 'shenlong', text } });
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

  private get m(): MachineState {
    return useStore.getState().m;
  }

  attach(recorder: AudioRecorder) {
    if (!this.voice) this.voice = new VoiceListener(recorder);
  }

  // ───────────── entradas externas ─────────────
  async start() {
    if (this.started || this.m.phase !== 'boot') return;
    this.started = true;
    loadSfx();
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

  background() {
    this.cancelAll();
    this.dispatch({ type: 'BACKGROUND' });
  }

  /** Atalho de debug: pula direto para uma fase (tela /debug). */
  debugGoto(phase: Phase) {
    this.cancelAll();
    useStore.getState().set({ m: { phase, wishes: 0, idlePrompts: 0 }, caption: null, speaking: false });
    this.enter(phase, 'debug');
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

    switch (phase) {
      case 'altar':
        st.set({ caption: null });
        stopAllSfx();
        playSfx('drone', { loop: true, volume: 0.5 });
        this.listen('invocation');
        break;

      case 'summoning': {
        this.history = [];
        st.set({ caption: null });
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
        if (this.goodbyeFixed) {
          this.sayLine('goodbye', () => alive(), () => this.dispatch({ type: 'GOODBYE_DONE' }));
        } else {
          this.later(700, () => this.dispatch({ type: 'GOODBYE_DONE' }));
        }
        break;

      case 'disappearing':
        this.history = [];
        playSfx('roar', { volume: 0.7 });
        this.later(300, () => this.bolt(true));
        this.later(TIMING.disappear - 800, () => hap.warning());
        this.later(TIMING.disappear, () => this.dispatch({ type: 'DISAPPEAR_DONE' }));
        break;

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
    if (st.micDenied && mode === 'invocation') return; // só toque longo
    const myTurn = this.turn;
    void this.voice?.start({
      onLevel: (l) => {
        micLevel.value = l;
      },
      onSpeechStart: () => {
        if (mode === 'invocation') {
          useStore.getState().bump('heard'); // esferas acendem NA HORA, antes do STT
          hap.select();
        } else {
          this.armIdle(); // criança está falando: reinicia o contador de silêncio
        }
      },
      onClip: (clip) => {
        if (myTurn !== this.turn) return;
        void this.onClip(mode, clip);
      },
    });
  }

  private async onClip(mode: 'invocation' | 'conversation', clip: ClipInfo) {
    if (this.processing) return;
    const phaseAtStart = this.m.phase;
    let text = '';
    try {
      text = await transcribe(clip.uri);
    } catch (e) {
      if (!(e instanceof SttUnavailable)) return;
      // sem STT/sem internet
      if (mode === 'invocation') {
        // degradação elegante: uma fala alta de 0,8–4,5 s vale como invocação
        if (clip.voiceMs >= 800 && clip.voiceMs <= 4500 && clip.peak > 0.55) {
          this.invoke();
        } else useStore.getState().bump('missed');
      } else if (this.m.phase === 'listening') {
        await this.failTurn('offline');
      }
      return;
    }
    if (this.m.phase !== phaseAtStart) return;
    if (looksLikeHallucination(text, clip.voiceMs)) {
      if (mode === 'invocation') useStore.getState().bump('missed');
      return;
    }
    if (mode === 'invocation') {
      if (isInvocation(text)) this.invoke();
      else useStore.getState().bump('missed');
    } else {
      void this.handleUtterance(text);
    }
  }

  private invoke() {
    if (this.m.phase !== 'altar') return;
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
    useStore.getState().set({ caption: { id: Date.now(), who: 'user', text } });
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
