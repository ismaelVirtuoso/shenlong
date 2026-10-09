import { Event, initialState, isMicOpen, MachineState, transition } from './machine';

const run = (events: Event[], s: MachineState = initialState) => events.reduce(transition, s);

describe('machine', () => {
  it('fluxo feliz até a despedida e retorno ao altar', () => {
    const s = run([
      { type: 'START' },
      { type: 'INVOKE' },
      { type: 'SUMMON_DONE' },
      { type: 'APPEAR_DONE' },
      { type: 'GREETING_DONE' },
      { type: 'UTTERANCE' },
      { type: 'REPLY_STARTED' },
      { type: 'REPLY_DONE', farewell: false },
    ]);
    expect(s.phase).toBe('listening');
    const end = run(
      [
        { type: 'UTTERANCE' },
        { type: 'REPLY_STARTED' },
        { type: 'REPLY_DONE', farewell: true },
        { type: 'GOODBYE_DONE' },
        { type: 'DISAPPEAR_DONE' },
      ],
      s,
    );
    expect(end.phase).toBe('altar');
    expect(end.wishes).toBe(0);
  });

  it('ignora eventos inválidos para a fase', () => {
    expect(run([{ type: 'INVOKE' }]).phase).toBe('boot');
    expect(run([{ type: 'START' }, { type: 'UTTERANCE' }]).phase).toBe('altar');
    expect(run([{ type: 'START' }, { type: 'INVOKE' }, { type: 'INVOKE' }]).phase).toBe('summoning');
  });

  it('falar durante a invocação não interrompe a sequência', () => {
    const s = run([{ type: 'START' }, { type: 'INVOKE' }, { type: 'UTTERANCE' }, { type: 'INTERRUPT' }]);
    expect(s.phase).toBe('summoning');
  });

  it('toque interrompe a fala e volta a ouvir', () => {
    const s = run([
      { type: 'START' },
      { type: 'INVOKE' },
      { type: 'SUMMON_DONE' },
      { type: 'APPEAR_DONE' },
      { type: 'GREETING_DONE' },
      { type: 'UTTERANCE' },
      { type: 'REPLY_STARTED' },
      { type: 'INTERRUPT' },
    ]);
    expect(s.phase).toBe('listening');
  });

  it('silêncio: 1º timeout pergunta, 2º despede', () => {
    const listening = run([
      { type: 'START' },
      { type: 'INVOKE' },
      { type: 'SUMMON_DONE' },
      { type: 'APPEAR_DONE' },
      { type: 'GREETING_DONE' },
    ]);
    const asked = transition(listening, { type: 'IDLE_TIMEOUT' });
    expect(asked.phase).toBe('speaking');
    const again = run([{ type: 'REPLY_DONE', farewell: false }, { type: 'IDLE_TIMEOUT' }], asked);
    expect(again.phase).toBe('goodbye');
  });

  it('falha da IA vira fala e volta a ouvir', () => {
    const s = run([
      { type: 'START' },
      { type: 'INVOKE' },
      { type: 'SUMMON_DONE' },
      { type: 'APPEAR_DONE' },
      { type: 'GREETING_DONE' },
      { type: 'UTTERANCE' },
      { type: 'REPLY_FAILED' },
      { type: 'REPLY_DONE', farewell: false },
    ]);
    expect(s.phase).toBe('listening');
  });

  it('background volta ao altar (exceto no boot)', () => {
    expect(run([{ type: 'BACKGROUND' }]).phase).toBe('boot');
    expect(run([{ type: 'START' }, { type: 'INVOKE' }, { type: 'BACKGROUND' }]).phase).toBe('altar');
  });

  it('mic aberto só no altar e na escuta', () => {
    expect(isMicOpen('altar') && isMicOpen('listening')).toBe(true);
    expect(isMicOpen('speaking') || isMicOpen('thinking') || isMicOpen('summoning')).toBe(false);
  });
});
