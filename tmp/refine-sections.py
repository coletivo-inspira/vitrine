from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]; p=root/'web/index.html'; html=p.read_text(encoding='utf-8')
v='<svg class="split-v" viewBox="0 0 130 122" aria-hidden="true"><path class="v-left" d="M0 0H26L65 86V122L43 108Z"/><path class="v-right" d="M65 86L103 0H130L87 108L65 122Z"/></svg>'
html=html.replace('Seu negócio,<br>em vitrine.','Seu negócio,<br>em <span class="branded-word"><span class="visually-hidden">v</span>'+v+'itrine.</span>')
html=html.replace('<script type="module" src="./app.js"></script>','<script type="module" src="./app.js"></script>\n  <script src="./categories.js" defer></script>')
links={}
for a in re.findall(r'<li><a href="(.*?)" target="_blank" rel="noopener noreferrer">(.*?)<svg',html):links[a[1]]=a[0]
groups=[
('food','Alimentação','Sabores, cardápios e encontros. Sites para dar espaço ao seu negócio de alimentação.',['Pastus Fogo & Parrilla','Bar da Cácia','Aldeia MIX'],['pastus','cacia','aldeiamix']),
('art','Arte & design','Projetos e processos criativos com uma apresentação que acompanha sua identidade.',['Dani Braga Design','Fantaze'],['dani','fantaze']),
('photo','Fotografia & mídia','Imagem, comunicação e produção de conteúdo em um portfólio próprio.',['Nathália Verri'],['nathalia']),
('health','Saúde','Informações sobre o atendimento e caminhos simples para o primeiro contato.',['Felipe Carvalho','Nexa Enfermagem','Sara Coutinho','Cássio Bragança'],['felipe','nexa','sara','cassio']),
('tech','Tecnologia','Um espaço para apresentar soluções, produtos e projetos digitais.',[],[])]
buttons=[]; panels=[]
arrow='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>'
for key,name,desc,names,images in groups:
 buttons.append(f'<button class="area-choice area-{key}" type="button" data-area="{key}" aria-pressed="false" aria-controls="area-{key}">{v}<span>{name}</span></button>')
 cards=[]
 for n,img in zip(names,images):
  cards.append(f'<a class="area-example example-preview" href="{links[n]}" target="_blank" rel="noopener noreferrer"><img src="./assets/showcase/{img}.jpg" width="1280" height="900" alt="Prévia do site {n}" loading="lazy"><span>{n}{arrow}<span class="visually-hidden"> (abre em nova aba)</span></span></a>')
 content='<div class="area-examples">'+''.join(cards)+'</div>' if cards else '<p class="area-empty">Ainda não há exemplo publicado nesta área. <a href="#contato">Converse sobre seu projeto</a>.</p>'
 panels.append(f'<section class="area-panel area-{key}" id="area-{key}" aria-labelledby="area-title-{key}"><div class="area-heading"><h3 id="area-title-{key}">{name}</h3><p>{desc}</p></div>{content}</section>')
start=html.index('      <div class="possibility-grid">');end=html.index('    </section>',start)
html=html[:start]+'      <div class="area-choices" role="group" aria-label="Explorar exemplos por área" hidden>'+''.join(buttons)+'</div>\n      <div class="area-panels">'+''.join(panels)+'</div>\n      <p class="section-note">Exemplos reais organizados por área de atuação. Estes trabalhos mostram possibilidades; não são modelos prontos para contratação.</p>\n'+html[end:]
html=re.sub(r'  <footer class="site-footer">.*?</footer>','  <footer class="site-footer compact-footer"><div class="wrap"><p>© 2026 <a href="https://inspira.dev.br/">Coletivo Inspira</a>. Todos os direitos reservados.</p></div></footer>',html,flags=re.S)
p.write_text(html,encoding='utf-8')
