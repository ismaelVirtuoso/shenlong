import { config } from '../config.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function call(model: string, method: 'generateContent' | 'streamGenerateContent', body: unknown): Promise<Response> {
  const q = method === 'streamGenerateContent' ? '?alt=sse' : '';
  const r = await fetch(`${BASE}/models/${model}:${method}${q}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gemini ${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

interface Part {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}
interface Reply {
  candidates?: { content?: { parts?: Part[] } }[];
}
const partsOf = (j: Reply): Part[] => j.candidates?.[0]?.content?.parts ?? [];

/** Chat em streaming: devolve os deltas de texto. */
export async function* geminiChatStream(
  system: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): AsyncGenerator<string> {
  const r = await call(config.geminiChatModel, 'streamGenerateContent', {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
    generationConfig: { maxOutputTokens: 400, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
  });
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        for (const p of partsOf(JSON.parse(line.slice(5)) as Reply)) if (p.text) yield p.text;
      } catch {
        /* linha parcial/keep-alive */
      }
    }
  }
}

/** Fala → texto (áudio enviado inline). */
export async function geminiTranscribe(file: File, prompt: string): Promise<string> {
  const data = Buffer.from(await file.arrayBuffer()).toString('base64');
  const mimeType = file.type && file.type !== 'application/octet-stream' ? file.type : 'audio/mp4';
  const r = await call(config.geminiSttModel, 'generateContent', {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Transcreva fielmente esta fala em português do Brasil, de uma criança ou adulto. Dicas de vocabulário: ${prompt} Responda SOMENTE com a transcrição, sem comentários; se não houver fala, responda vazio.`,
          },
          { inlineData: { mimeType, data } },
        ],
      },
    ],
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });
  return partsOf((await r.json()) as Reply).map((p) => p.text ?? '').join('').trim();
}

/** PCM 16-bit mono → WAV. */
function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Texto → WAV (a API devolve PCM 24 kHz). */
export async function geminiSpeak(text: string, style: string): Promise<Buffer> {
  const r = await call(config.geminiTtsModel, 'generateContent', {
    contents: [{ parts: [{ text: `${style}\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.geminiVoice } } },
    },
  });
  const part = partsOf((await r.json()) as Reply).find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error('gemini tts: sem áudio na resposta');
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000);
  return wav(Buffer.from(part.inlineData.data, 'base64'), rate);
}
