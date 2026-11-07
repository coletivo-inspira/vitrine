from pathlib import Path
import pymupdf as f
root=Path(__file__).resolve().parents[1]
out=root/'docs/design/logo-study'
ink='#133824'; lime='#BAFF29'; paper='#F7F7F4'
def rgb(h): return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
def make(w,h):
 d=f.open(); p=d.new_page(width=w,height=h)
 p.insert_font(fontname='dm',fontfile=str(root/'web/assets/fonts/dm-sans.ttf'))
 p.insert_font(fontname='segoe',fontfile='C:/Windows/Fonts/segoeuib.ttf')
 return d,p
def rect(p,x,y,w,h,c): p.draw_rect(f.Rect(x,y,x+w,y+h),color=None,fill=rgb(c))
def text(p,x,y,s,size=18,font='dm',c=ink): p.insert_text((x,y),s,fontname=font,fontsize=size,color=rgb(c))
def symbol(p,x,y,size,dark=False):
 rect(p,x,y,size,size,ink if dark else lime)
 s=size/196; ox=x+33*s; oy=y+37*s
 for points,c in [([(0,0),(26,0),(65,86),(65,122),(43,108)],lime if dark else ink), ([(65,86),(103,0),(130,0),(87,108),(65,122)],'#A3E5C2' if dark else ink)]:
  pts=[f.Point(ox+a*s,oy+b*s) for a,b in points]
  sh=p.new_shape(); sh.draw_polyline(pts+[pts[0]]); sh.finish(color=None,fill=rgb(c)); sh.commit()
def lockup(p,x,y,size=120,font='segoe',dark=False):
 symbol(p,x,y,size,dark)
 text(p,x+size+size*.24,y+size*.70,'vitrine',size*.78,font,c=paper if dark else ink)
def save(p,name):
 (out/(name+'.svg')).write_text(p.get_svg_image(text_as_path=True),encoding='utf-8')
 p.get_pixmap(matrix=f.Matrix(1.5,1.5),alpha=False).save(str(out/(name+'.png')))
d,p=make(1400,1040)
rect(p,0,0,1400,1040,paper)
text(p,64,77,'O V ganha uma casa.',38,'segoe')
text(p,64,115,'Caixa verde + apenas vitrine. Duas opções de tipografia, sem esticar as letras.',20)
rect(p,64,153,1272,1,'#DDDCD6')
text(p,64,204,'A / Mais presença',23,'segoe')
text(p,750,204,'B / Mais leveza',23,'segoe')
lockup(p,64,250,125,'segoe'); lockup(p,750,250,125,'dm')
text(p,64,423,'Segoe UI Bold · proporção natural, traço mais firme.',17)
text(p,750,423,'DM Sans · desenho mais leve e aberto.',17)
text(p,64,468,'O verde-lima aproxima do coletivo. O V passa a identificar o produto.',20)
rect(p,64,503,1272,1,'#DDDCD6')
rect(p,64,545,1272,231,ink)
lockup(p,100,592,125,'segoe',True)
text(p,755,620,'Alternativa em verde-floresta',24,'segoe',paper)
text(p,755,660,'Lima e menta revelam as duas lâminas do V.',18,c=paper)
text(p,755,694,'Mesmo símbolo, com contraste no fundo escuro.',18,c=paper)
text(p,64,831,'Redução',21,'segoe')
symbol(p,64,859,48); symbol(p,136,871,32); symbol(p,192,879,24)
text(p,310,879,'Inspira sai da assinatura principal.',22,'segoe')
text(p,310,912,'O vínculo pode aparecer no rodapé: “Um projeto do Coletivo Inspira”.',18)
text(p,64,995,'ESTUDO PARA ESCOLHA · marca do produto, sem alteração do símbolo oficial do coletivo',16)
save(p,'vitrine-caixa-verde-comparativo')
d2,p2=make(510,150); lockup(p2,10,10,125,'segoe')
(out/'vitrine-caixa-verde.svg').write_text(p2.get_svg_image(text_as_path=True),encoding='utf-8')
print(out)
