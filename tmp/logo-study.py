from pathlib import Path
import pymupdf as f

root=Path(__file__).resolve().parents[1]
out=root/'docs/design/logo-study'
d=f.open(); p=d.new_page(width=1440,height=1100)
def rgb(h): return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
paper='#F7F7F4'; ink='#133824'; orange='#F05D23'; lime='#BAFF29'
def rect(x,y,w,h,c): p.draw_rect(f.Rect(x,y,x+w,y+h),color=None,fill=rgb(c))
def txt(x,y,s,size=18,c=ink,display=False):
    name='syne' if display else 'dm'
    p.insert_font(fontname=name,fontfile=str(root/('web/assets/fonts/syne.ttf' if display else 'web/assets/fonts/dm-sans.ttf')))
    p.insert_text((x,y),s,fontsize=size,fontname=name,color=rgb(c))
def poly(points,c):
    sh=p.new_shape(); sh.draw_polyline([f.Point(*v) for v in points]+[f.Point(*points[0])]); sh.finish(color=None,fill=rgb(c)); sh.commit()
def mark(x,y,s,a=orange,b=ink):
    # Two open display planes: their meeting edge forms a V.
    poly([(x,y),(x+26*s,y),(x+65*s,y+86*s),(x+65*s,y+122*s),(x+43*s,y+108*s)],a)
    poly([(x+65*s,y+86*s),(x+103*s,y),(x+130*s,y),(x+87*s,y+108*s),(x+65*s,y+122*s)],b)
def plus(x,y,s):
    rect(x,y,s,s,lime)
    v=s/196
    poly([(x+75*v,y+19*v),(x+121*v,y+19*v),(x+121*v,y+75*v),(x+177*v,y+75*v),(x+177*v,y+121*v),(x+121*v,y+121*v),(x+121*v,y+177*v),(x+75*v,y+177*v),(x+75*v,y+121*v),(x+19*v,y+121*v),(x+19*v,y+75*v),(x+75*v,y+75*v)],ink)
rect(0,0,1440,1100,paper)
txt(64,78,'Vitrine Inspira',44,display=True)
txt(64,113,'Duas direções de marca · estudo inicial para comparação',19)
rect(64,147,1312,1,'#DDDCD6')
txt(64,195,'A / Assinatura de família',25,display=True)
txt(760,195,'B / Planos abertos',25,display=True)
plus(66,270,95)
txt(185,315,'vitrine',57,display=True); txt(185,371,'inspira',57,display=True)
txt(66,444,'O símbolo oficial identifica o pertencimento.',18)
txt(66,474,'Syne e composição própria dão voz ao produto.',18)
mark(760,270,1.05)
txt(930,315,'vitrine',57,display=True); txt(930,371,'inspira',57,display=True)
txt(760,444,'Duas lâminas abertas se encontram em um V.',18)
txt(760,474,'Forma fixa. Cores variáveis. Endosso separado.',18)
rect(64,520,1312,1,'#DDDCD6')
txt(64,570,'Uma forma, diferentes contextos',29,display=True)
txt(64,604,'Estudo da direção B. Categorias indicativas; a cor não substitui o nome.',17)
colors=[('Alimentação',orange,'#E5A93C'),('Arte & design','#E5007C','#E5A93C'),('Fotografia',ink,'#BAFF29'),('Saúde',ink,'#A3E5C2'),('Tecnologia*','#2454FF','#00A9CC')]
for i,(label,a,b) in enumerate(colors):
    x=64+i*268
    mark(x+45,648,.70,a,b)
    txt(x,778,label,20,display=True)
    rect(x,798,74,6,a); rect(x+80,798,74,6,b)
txt(64,850,'* Azul e ciano são uma proposta de extensão da Vitrine, fora da paleta oficial do coletivo.',16)
rect(64,885,1312,1,'#DDDCD6')
mark(64,927,.38,ink,ink); txt(133,957,'Uma cor',17)
mark(300,940,.18,ink,ink); txt(339,957,'Ícone 24 px',17)
plus(760,923,42); txt(818,952,'Um projeto do Coletivo Inspira',21)
txt(64,1040,'PROPOSTAS EM ESTUDO · SVG vetorial · sem aplicação no site de produção',15)
p.get_pixmap(matrix=f.Matrix(1.5,1.5)).save(str(out/'comparativo.png'))
(out/'comparativo.svg').write_text(p.get_svg_image(text_as_path=True),encoding='utf-8')
(out/'simbolo-planos-abertos.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 150 142" role="img" aria-label="Vitrine Inspira — estudo de símbolo"><path fill="#F05D23" d="M0 0H26L65 86V122L43 108Z"/><path fill="#133824" d="M65 86L103 0H130L87 108L65 122Z"/></svg>''',encoding='utf-8')
print(out)

