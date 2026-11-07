"""Export the approved A artwork; lettering stays in outlines, with no font dependency."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'docs/design/logo-study/vitrine-caixa-verde.svg').read_text(encoding='utf-8')
target = ROOT / 'web/assets/brand'
defs = re.search(r'<defs>(.*?)</defs>', source, re.S).group(1)
letters = '\n'.join(re.findall(r'<use [^>]+/>', source))
endorsement = (ROOT / 'docs/design/logo-study/coletivo-inspira-endorsement.svg').read_text(encoding='utf-8')
defs += re.search(r'<defs>(.*?)</defs>', endorsement, re.S).group(1)
letters += '\n' + '\n'.join(re.findall(r'<use [^>]+/>', endorsement))
box = '<rect x="10" y="10" width="125" height="125" fill="#BAFF29"/>'
left = '<path d="M31.04592 33.59694H47.62755L72.5 88.44388V111.40306L58.46939 102.47449Z"/>'
right = '<path d="M72.5 88.44388L96.7347 33.59694H113.95408L86.53061 102.47449L72.5 111.40306Z"/>'
symbol = f'{box}<g fill="#133824"><g class="blade-left">{left}</g><g class="blade-right">{right}</g></g>'
style = '''<style>
@media (prefers-reduced-motion: no-preference) {
 .blade-left { animation: open-left 700ms cubic-bezier(.16,1,.3,1) both; transform-origin:72.5px 111.4px; }
 .blade-right { animation: open-right 700ms cubic-bezier(.16,1,.3,1) both; transform-origin:72.5px 111.4px; }
 @keyframes open-left { from { transform:rotate(12deg); } to { transform:rotate(0); } }
 @keyframes open-right { from { transform:rotate(-12deg); } to { transform:rotate(0); } }
}
</style>'''
def svg(body, view, width, height, animated=False):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view}" width="{width}" height="{height}" role="img" aria-labelledby="brand-title">
<title id="brand-title">{'vitrine — coletivo inspira' if '<use ' in body else 'vitrine'}</title>
<desc>V de duas lâminas dentro de uma caixa verde-lima. Marca da Vitrine, um projeto do Coletivo Inspira.</desc>
{'<defs>'+defs+'</defs>' if '<use ' in body else ''}
{style if animated else ''}
{body}
</svg>\n'''
for name, animated in [('vitrine.svg', False), ('vitrine-animated.svg', True)]:
    (target/name).write_text(svg(symbol+'<g>'+letters+'</g>', '0 0 470 145', 470, 145, animated), encoding='utf-8')
(target/'vitrine-icon.svg').write_text(svg(symbol, '10 10 125 125', 125, 125), encoding='utf-8')
inverse = (symbol+'<g>'+letters+'</g>').replace('#133824','#F7F7F4')
(target/'vitrine-inverse.svg').write_text(svg(inverse, '0 0 470 145', 470, 145), encoding='utf-8')
