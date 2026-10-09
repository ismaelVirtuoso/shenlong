export type Flag = 'concedido' | 'adeus';

/**
 * Consome deltas de texto e emite frases completas (para TTS em pipeline) e flags
 * ([CONCEDIDO]/[ADEUS]) — tags podem chegar partidas entre deltas.
 */
export class SentenceStream {
  private buf = '';
  private head = true; // ainda no começo: tags de abertura
  readonly flags = new Set<Flag>();

  push(delta: string): { sentences: string[]; flags: Flag[] } {
    this.buf += delta;
    const flags = this.extractTags();
    return { sentences: this.drain(false), flags };
  }

  end(): { sentences: string[]; flags: Flag[] } {
    const flags = this.extractTags();
    this.head = false;
    return { sentences: this.drain(true), flags };
  }

  private extractTags(): Flag[] {
    const found: Flag[] = [];
    this.buf = this.buf.replace(/\[(CONCEDIDO|ADEUS)\]/gi, (_, t: string) => {
      const f = t.toLowerCase() as Flag;
      if (!this.flags.has(f)) found.push(f);
      this.flags.add(f);
      return '';
    });
    return found;
  }

  private drain(final: boolean): string[] {
    // não solta nada se pode haver uma tag partida no fim ("[CONC")
    const open = this.buf.lastIndexOf('[');
    const safeLen = !final && open >= 0 && !this.buf.includes(']', open) ? open : this.buf.length;
    const text = this.buf.slice(0, safeLen);
    const out: string[] = [];
    let start = 0;
    // reticências "..." são pausa dramática, não fim de frase
    const re = /(?:[!?]+|(?<!\.)\.(?!\.))["”')]*\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const s = text.slice(start, m.index + m[0].length).trim();
      if (s.length >= 12) {
        out.push(clean(s));
        start = m.index + m[0].length;
      }
    }
    let rest = text.slice(start);
    if (final) {
      const s = clean(rest);
      if (s) out.push(s);
      rest = '';
    }
    this.buf = rest + this.buf.slice(safeLen);
    return out.filter(Boolean);
  }
}

const clean = (s: string) => s.replace(/[*_#`~]/g, '').replace(/\s+/g, ' ').trim();
