#!/usr/bin/env python3
"""Junta PNGs numa grade (redimensiona p/ a altura da 1ª). Uso: grid.py out.png COLS a.png b.png ..."""
import sys
from PIL import Image

out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
imgs = [Image.open(f).convert('RGB') for f in files]
h = imgs[0].height
imgs = [im.resize((round(im.width * h / im.height), h)) for im in imgs]
w = max(im.width for im in imgs)
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for i, im in enumerate(imgs):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
