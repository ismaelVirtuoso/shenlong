#!/usr/bin/env python3
"""Acabamento do ícone renderizado: contraste, vinheta e brilho dourado de borda. Uso: finish_icon.py in.png out.png"""
import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageChops, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
w, h = im.size
im = ImageEnhance.Contrast(im).enhance(1.12)
im = ImageEnhance.Color(im).enhance(1.05)
# bloom suave: soma das altas luzes desfocadas
hi = im.point(lambda v: max(0, v - 195) * 3)
im = ImageChops.add(im, hi.filter(ImageFilter.GaussianBlur(w / 40)), scale=2.2)
# vinheta radial
mask = Image.new('L', (w, h), 0)
d = ImageDraw.Draw(mask)
for i in range(60):
    k = i / 60
    d.ellipse([w * (-0.25 + 0.25 * k), h * (-0.25 + 0.25 * k), w * (1.25 - 0.25 * k), h * (1.25 - 0.25 * k)], fill=int(255 * k))
mask = mask.filter(ImageFilter.GaussianBlur(w / 16))
dark = Image.new('RGB', (w, h), (2, 8, 6))
im = Image.composite(im, dark, mask.point(lambda v: 90 + v * 165 // 255))
im.save(dst, optimize=True)
