"""Worker de reconhecimento de fala local (faster-whisper), persistente.
Protocolo: linha JSON {"path": "..."} → linha JSON {"text": "..."}; primeira linha do stdout: "READY".
"""
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

size = sys.argv[1] if len(sys.argv) > 1 else "base"
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "whisper")
model = WhisperModel(size, device="cpu", compute_type="int8", download_root=root, cpu_threads=4)
PROMPT = "Shenlong, apareça! Esferas do Dragão. Eu quero um desejo."


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)


print("READY", flush=True)
for line in sys.stdin:
    try:
        audio = load(json.loads(line)["path"])
        segs, _ = model.transcribe(audio, language="pt", beam_size=1, initial_prompt=PROMPT, condition_on_previous_text=False)
        text = "".join(s.text for s in segs).strip()
    except Exception:
        text = ""
    print(json.dumps({"text": text}, ensure_ascii=False), flush=True)
