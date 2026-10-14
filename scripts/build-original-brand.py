"""Build vector assets from the exact symbol, fonts and colors on smilepec.fr.

Inputs: original Google Fonts TTFs in tmp/official-brand and fonttools/uharfbuzz.
No tracing, invented letterforms, background or raster retouching.
"""
import io
import sys
from pathlib import Path
sys.path.insert(0, str(Path('tmp/official-brand/packages').resolve()))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
import uharfbuzz as hb

ROOT = Path('tmp/official-brand')
OUT = Path('public/brand')
OUT.mkdir(exist_ok=True)
fonts = {}
licenses = []
for name in ('cormorant', 'kaushan'):
    font = TTFont(ROOT / (name + '.ttf'))
    licenses.extend(n.toUnicode() for n in font['name'].names if n.nameID in (0, 13, 14))
    if 'fvar' in font:
        font = instantiateVariableFont(font, {'wght': 600}, inplace=False)
    stream = io.BytesIO()
    font.save(stream)
    fonts[name] = (font, stream.getvalue())

def text_paths(text, family, size, color, x, baseline, tracking=0):
    font, data = fonts[family]
    face = hb.Face(data)
    shaping = hb.Font(face)
    shaping.scale = (face.upem, face.upem)
    hb.ot_font_set_funcs(shaping)
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(shaping, buffer)
    glyphs = font.getGlyphSet()
    order = font.getGlyphOrder()
    scale = size / face.upem
    paths = []
    for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
        pen = SVGPathPen(glyphs)
        glyphs[order[info.codepoint]].draw(pen)
        paths.append(f'<path fill="{color}" transform="translate({x + position.x_offset * scale:.5f} {baseline-position.y_offset*scale:.5f}) scale({scale:.8f} {-scale:.8f})" d="{pen.getCommands()}"/>')
        x += position.x_advance * scale + tracking
    return ''.join(paths), x

symbol = '<path d="M10 33 Q26 55 45 33 Q64 11 80 33" fill="none" stroke="#3b322d" stroke-width="5" stroke-linecap="round"/><path d="M56 31 L64 41 L82 15" fill="none" stroke="#8a6f4e" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'
def svg(width, height, content):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.3f} {height:.3f}" role="img" aria-label="SmilePec"><title>SmilePec</title>{content}</svg>'

smile, end = text_paths('Smile', 'cormorant', 28, '#3b322d', 44, 32, .28)
pec, end = text_paths('Pec', 'kaushan', 23, '#8a6f4e', end+1, 32)
(OUT/'smilepec-original-logo.svg').write_text(svg(end+3, 43, f'<g transform="translate(3 10) scale(.34)">{symbol}</g>'+smile+pec), encoding='utf8')
smile, end = text_paths('Smile', 'cormorant', 72, '#3b322d', 5, 116, .72)
pec, end = text_paths('Pec', 'kaushan', 58, '#8a6f4e', end+2, 116)
width=end+7
(OUT/'smilepec-original-stacked.svg').write_text(svg(width, 143, f'<g transform="translate({(width-72)/2:.3f} 0) scale(.8)">{symbol}</g>'+smile+pec), encoding='utf8')
(OUT/'smilepec-original-mark.svg').write_text(svg(90, 60, symbol), encoding='utf8')
(OUT/'original-font-licenses.txt').write_text('\n\n'.join(dict.fromkeys(licenses)), encoding='utf8')
print('Original brand vectors generated from the source symbol and original font outlines.')
