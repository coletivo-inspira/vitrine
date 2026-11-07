from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=root/'web/index.html'; html=p.read_text(encoding='utf-8')
old=re.search(r'      <div class="possibility-grid">.*?</article></div>',html).group()
items={}
for li in re.findall(r'<li>.*?</li>',old):
 name=re.search(r'rel="noopener noreferrer">(.*?)<svg',li).group(1)
 items[name]=li
arrow='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>'
groups=[
 ('Cardápio digital','cardápio digital','pastus','Pastus Fogo & Parrilla','Da vontade de conhecer ao próximo pedido. Exemplos para apresentar sabores, bebidas e o cardápio do negócio.',['Pastus Fogo & Parrilla','Bar da Cácia']),
 ('Serviços','serviços','felipe','Felipe Carvalho','O que você faz e como entrar em contato. Exemplos para profissionais, atendimentos e negócios de serviços.',['Felipe Carvalho','Nexa Enfermagem','Sara Coutinho','Cássio Bragança','Dani Braga Design']),
 ('Portfólio','portfólio','nathalia','Nathália Verri','Projetos, trabalhos e trajetórias em destaque. Exemplos para apresentar uma produção e a identidade de quem a realiza.',['Nathália Verri','Dani Braga Design','Aldeia MIX','Fantaze'])
]
cards=[]
for title,label,image,name,description,names in groups:
 url=re.search(r'href="([^"]+)"',items[name]).group(1)
 cards.append(f'''        <article class="possibility">
          <a class="example-preview" href="{url}" target="_blank" rel="noopener noreferrer" aria-label="Conhecer {name} (abre em nova aba)"><img src="./assets/showcase/{image}.jpg" width="1280" height="900" alt="Site de {name}" loading="lazy"><span>Conhecer {name}{arrow}</span></a>
          <div class="possibility-caption"><h3>{title}</h3><span class="tag">Exemplos reais</span></div>
          <p>{description}</p>
          <ul class="example-links" aria-label="Exemplos de {label}">
            {chr(10).join(items[n] for n in names)}
          </ul>
        </article>''')
html=html.replace(old,'      <div class="possibility-grid">\n'+'\n'.join(cards)+'\n      </div>')
html=html.replace('Cada negócio tem seu contexto. Estes sites mostram possibilidades; não são modelos prontos para contratação.','Um site pode apresentar serviços e também funcionar como portfólio. Por isso, alguns exemplos aparecem em mais de uma categoria. São trabalhos reais, não modelos prontos para contratação.')
p.write_text(html,encoding='utf-8')
