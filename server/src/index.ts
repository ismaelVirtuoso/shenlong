import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import { llmAvailable, streamReply, type Turn } from './providers/llm.js';
import { sttAvailable, transcribe } from './providers/stt.js';
import { synthesize, ttsAvailable, ttsEngine } from './providers/tts.js';
import { warmPiper } from './voice/piper.js';
import { REDIRECT_INPUT, SAFE_OUTPUT, isUnsafe } from './safety.js';
import { SentenceStream } from './sentences.js';

const app = new Hono();
app.use('*', cors());

// ── auth + rate limit (por IP, janela de 1 min). Sem logs de conteúdo: só metadados. ──
const hits = new Map<string, { n: number; t: number }>();
app.use('/api/*', async (c, next) => {
  if (config.appToken && c.req.header('x-app-token') !== config.appToken) return c.json({ error: 'unauthorized' }, 401);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) hits.set(ip, { n: 1, t: now });
  else if (++h.n > config.limits.ratePerMinute) return c.json({ error: 'rate_limited' }, 429);
  const t0 = now;
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - t0}ms`);
});

app.get('/health', (c) =>
  c.json({ ok: true, mock: config.mock, stt: sttAvailable(), tts: ttsAvailable(), ttsEngine: ttsEngine(), llm: llmAvailable(), llmProvider: config.llmProvider }),
);

app.post('/api/stt', async (c) => {
  if (!sttAvailable()) return c.json({ error: 'stt_unavailable' }, 501);
  const body = await c.req.parseBody();
  const file = body.audio;
  if (!(file instanceof File) || file.size === 0 || file.size > config.limits.audioBytes)
    return c.json({ error: 'bad_audio' }, 400);
  try {
    return c.json({ text: await transcribe(file) });
  } catch (e) {
    console.error('stt failed', (e as Error).message);
    return c.json({ error: 'stt_failed' }, 502);
  }
});

app.post('/api/tts', async (c) => {
  if (!ttsAvailable()) return c.json({ error: 'tts_unavailable' }, 501);
  const { text } = await c.req.json<{ text?: string }>();
  if (!text || text.length > 400) return c.json({ error: 'bad_text' }, 400);
  try {
    const audio = await synthesize(text);
    return new Response(new Uint8Array(audio), { headers: { 'content-type': audio.subarray(0, 4).toString() === 'RIFF' ? 'audio/wav' : 'audio/mpeg' } });
  } catch (e) {
    console.error('tts failed', (e as Error).message);
    return c.json({ error: 'tts_failed' }, 502);
  }
});

/**
 * NDJSON: {t:"flag",v:"concedido"|"adeus"} | {t:"sentence",text} | {t:"done"}
 * Cada frase sai assim que completa, para o app já pedir TTS (pipeline de baixa latência).
 */
app.post('/api/chat', async (c) => {
  if (!llmAvailable()) return c.json({ error: 'llm_unavailable' }, 501);
  const body = await c.req.json<{ history?: Turn[]; wishes?: number }>();
  const history = (body.history ?? [])
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-config.limits.historyTurns)
    .map((t) => ({ role: t.role, content: t.content.slice(0, config.limits.textChars) }));
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') return c.json({ error: 'bad_history' }, 400);
  while (history[0]?.role === 'assistant') history.shift();
  const wishes = Math.min(Math.max(body.wishes ?? 0, 0), config.maxWishes);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        if (isUnsafe(last.content)) {
          send({ t: 'sentence', text: REDIRECT_INPUT });
        } else {
          const ss = new SentenceStream();
          let blocked = false;
          const emit = (r: ReturnType<SentenceStream['push']>) => {
            for (const f of r.flags) send({ t: 'flag', v: f });
            for (const s of r.sentences) {
              if (isUnsafe(s)) {
                if (!blocked) send({ t: 'sentence', text: SAFE_OUTPUT });
                blocked = true;
              } else if (!blocked) send({ t: 'sentence', text: s });
            }
          };
          for await (const delta of streamReply(history, wishes)) {
            if (blocked) break;
            emit(ss.push(delta));
          }
          emit(ss.end());
        }
      } catch (e) {
        console.error('chat failed', (e as Error).message);
        send({ t: 'error' });
      }
      send({ t: 'done' });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
});

if (ttsEngine() === 'piper') warmPiper();

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (i) => {
  console.log(`🐉 Shenlong server :${i.port}  ouvir(STT)=${sttAvailable()}  voz(TTS)=${ttsEngine() ?? 'nenhuma'}  conversa(IA)=${llmAvailable() ? config.llmProvider : 'não'}`);
  if (!config.mock && (!sttAvailable() || !llmAvailable())) {
    console.log('\n⚠️  SEM CHAVE DE API: Shenlong não consegue ouvir nem conversar.');
    console.log('   Preencha OPENAI_API_KEY em server/.env (uma chave cobre ouvir, voz e conversa) e reinicie.\n');
  }
});
