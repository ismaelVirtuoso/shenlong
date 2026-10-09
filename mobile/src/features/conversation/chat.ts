import { fetch as streamFetch } from 'expo/fetch';
import { apiUrl } from '@/core/config';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatEvent =
  | { t: 'flag'; v: 'concedido' | 'adeus' }
  | { t: 'sentence'; text: string }
  | { t: 'error' }
  | { t: 'done' };

export class ChatUnavailable extends Error {}

/** Lê o NDJSON do backend e entrega cada evento assim que chega. */
export async function streamChat(
  history: Turn[],
  wishes: number,
  signal: AbortSignal,
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  let res;
  try {
    res = await streamFetch(`${apiUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ history, wishes }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) return;
    throw new ChatUnavailable(String(e));
  }
  if (!res.ok || !res.body) throw new ChatUnavailable(`chat ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const flush = (final: boolean) => {
    const lines = buf.split('\n');
    buf = final ? '' : (lines.pop() ?? '');
    for (const l of lines) {
      if (!l.trim()) continue;
      try { onEvent(JSON.parse(l) as ChatEvent); } catch {}
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      flush(false);
    }
    flush(true);
  } catch (e) {
    if (!signal.aborted) throw new ChatUnavailable(String(e));
  }
}
