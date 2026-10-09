"""Worker Piper persistente: carrega o modelo uma vez e sintetiza pedidos em sequência.
Protocolo (stdin/stdout): uma linha JSON {"text": "..."} → 4 bytes (uint32 LE) com o tamanho + PCM int16 mono.
A taxa de amostragem vai na primeira linha do stdout: "READY <sample_rate>\n".
"""
import json
import struct
import sys

from piper import PiperVoice

voice = PiperVoice.load(sys.argv[1])
rate = voice.config.sample_rate
silence = b"\x00\x00" * int(rate * 0.45)  # pausa entre frases (reticências viram frases)
out = sys.stdout.buffer
out.write(f"READY {rate}\n".encode())
out.flush()
for line in sys.stdin:
    try:
        text = json.loads(line)["text"]
        pcm = silence.join(chunk.audio_int16_bytes for chunk in voice.synthesize(text))
    except Exception:  # nunca derruba o worker
        pcm = b""
    out.write(struct.pack("<I", len(pcm)))
    out.write(pcm)
    out.flush()
