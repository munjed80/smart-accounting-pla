"""Regenerate the outlined social SVG from the bundled brand font.

Design-time only: python -m pip install fonttools brotli
Production builds rasterize the committed SVG with sharp; no fonts/Python needed.
"""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'src/assets/fonts/dm-sans-latin-wght-normal.woff2'
fonts = {}


def text(value, x, y, size, weight=500, color='#192e2b'):
    if weight not in fonts:
        fonts[weight] = instantiateVariableFont(TTFont(FONT), {'wght': weight})
    font = fonts[weight]
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    paths, cursor = [], 0
    for char in value:
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        paths.append(f'<path transform="translate({cursor},0)" d="{pen.getCommands()}"/>')
        cursor += glyph.width
    return f'<g aria-label="{escape(value)}" fill="{color}" transform="translate({x},{y}) scale({scale},-{scale})">{"".join(paths)}</g>'


parts = ['''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
<title id="title">ZZPers Hub — Meer ondernemen. Minder uitzoekwerk.</title>
<desc id="description">Facturen, klanten, uitgaven en uren op één plek. Drie maanden gratis proberen op zzpershub.nl.</desc>
<rect width="1200" height="630" fill="#f7f6f0"/>
<path d="M0 0h1200v8H0z" fill="#245c4e"/>
''']
icon = (ROOT / 'public/icon.svg').read_text().split('>', 1)[1].rsplit('</svg>', 1)[0]
parts.append(f'<g transform="translate(64,54) scale(0.125)">{icon}</g>')
parts += [text('ZZPers', 146, 99, 36, 700), text('Hub', 274, 99, 36, 400),
          text('VOOR ZZP’ERS IN NEDERLAND', 64, 195, 16, 600, '#60716b'),
          text('Meer ondernemen.', 60, 282, 64, 650),
          text('Minder uitzoekwerk.', 60, 359, 64, 650, '#245c4e'),
          text('Je administratie op één overzichtelijke plek.', 64, 422, 25, 400, '#60716b')]
parts.append('<rect x="790" y="152" width="346" height="320" rx="24" fill="#245c4e"/>')
parts.append(text('Jouw werkplek', 824, 203, 24, 600, '#ffffff'))
for label, y in [('Facturen', 255), ('Uitgaven', 311), ('Klanten', 367), ('Uren', 423)]:
    parts.append(f'<rect x="818" y="{y-29}" width="290" height="46" rx="10" fill="#ffffff" fill-opacity="0.07"/>')
    parts.append(f'<circle cx="844" cy="{y-6}" r="11" fill="#d9e8aa"/><path d="m839 {y-6} 3.5 3.5 6-7" fill="none" stroke="#245c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
    parts.append(text(label, 869, y+2, 24, 500, '#ffffff'))
parts.append('<path d="M64 510h1072" stroke="#dcded5"/>')
parts.append(text('zzpershub.nl', 64, 568, 26, 600, '#245c4e'))
parts.append('<rect x="756" y="534" width="380" height="50" rx="25" fill="#d9e8aa"/>')
parts.append(text('3 maanden gratis proberen', 783, 567, 23, 600, '#245c4e'))
parts.append('</svg>')
(ROOT / 'src/assets/brand/social-preview.svg').write_text('\n'.join(parts))
