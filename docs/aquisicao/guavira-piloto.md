# Vitrine piloto Guavira Fotos — roteiro de montagem

Issue #124. Estudo de mercado, [seção 6, item 5](../market-study-2026.md#6-estratégias-de-aquisição).

**Situação: preparado, não publicado.** Decisão do Lino (2026-11-14): preparar o
conteúdo e o fluxo, sem publicar dados reais da Guavira até o passo humano
`BLK-GUAVIRA-01` (autorização escrita da Guavira Fotos). Até lá:

- o repositório não guarda nenhum dado real da Guavira: nada de nomes de clientes,
  fotos, telefone, preços, endereço ou perfil de Instagram;
- a vitrine de exemplo e o case usam conteúdo fictício e marcadores
  `[a preencher com o conteúdo autorizado]`;
- o build não publica nem a vitrine nem o case (`test/guavira-piloto.test.mjs`).

O conteúdo real entra pelo painel (rascunho no Supabase), não pelo repositório. O
repositório só recebe, depois da autorização, o texto público do case e a captura
usada em Possibilidades.

## 1. O que já existe e o que ainda não existe

| Recurso | Situação | Como usar no piloto |
| --- | --- | --- |
| Área "Fotografia & mídia" e modelo "Agendamento de Serviços" (`booking-v1`) | Na `main` | Serviço com duração, data e horário; o visitante confirma pelo WhatsApp |
| Fotos dos itens em WebP ≤ 200 KB (ADR 0011) | Na `main` | O painel redimensiona (até 1600 px) e converte no navegador; recusa o que passar de 200 KB |
| Seções: abertura, sobre, perguntas, depoimentos, links e "horário e local" em texto (`hours_location`) | Na `main` | Aba Configurações → Seções |
| Cartão de prévia (Open Graph) | Na `main`, básico | Título = nome da vitrine; descrição = texto de boas-vindas; imagem = logo, capa ou primeira foto de item; sem foto, a imagem padrão da Vitrine |
| "Aberto agora", "Traçar rota" e QR Code (#118) | **PR aberto [#146](https://github.com/coletivo-inspira/vitrine/pull/146)**, ainda não na `main` | Enquanto não mesclar, usar a seção "horário e local" em texto. Depois do merge: Configurações → Horário de funcionamento, endereço público e download do QR |
| SEO local com JSON-LD `LocalBusiness` (#117) | **Não existe** | Não esperar. Quando existir, preencher e conferir na revisão seguinte |
| Domínio próprio | Fora de escopo (plano Essencial e #44) | Endereço `vitrine.inspira.dev.br/guavira-fotos` |

## 2. Vitrine de exemplo (rascunho)

`content/vitrines/rascunho-guavira-fotos.json` é o rascunho de demonstração com o
endereço `guavira-fotos`: modelo `booking-v1`, área `photo`, dois blocos (Ensaios e
Pacotes), cinco serviços ativos e um oculto, valores redondos marcados como
"Valor ilustrativo" e o número de exemplo `5511999999999` (o mesmo de `loja1`).

- Passa por `validateDraftContent`, `compilePublicStorefront` e
  `assertNoPrivateLeakage`, e pelo orçamento da vitrine pública
  (`test/storefront-budget.test.mjs` lê toda a pasta `content/vitrines/`).
- `scripts/build.mjs` publica só `loja1`; o rascunho não vai para `dist/`.
- O prefixo `rascunho-` mantém `loja1` como primeira vitrine do teste de orçamento.
- Serve de roteiro: a estrutura (blocos, seções, textos de exemplo) é a que se monta
  no painel. Não importar este arquivo como conteúdo real.

Prévia local, sem publicar (gera uma cópia em `/tmp`, fora do repositório):

```bash
npm run build
cp -r dist /tmp/guavira-preview
node --input-type=module -e "
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compilePublicStorefront, renderStorefrontHtml } from './src/publication-engine.mjs';
const out = '/tmp/guavira-preview';
const d = JSON.parse(await readFile('content/vitrines/rascunho-guavira-fotos.json', 'utf8'));
const c = await compilePublicStorefront(d, { slug: d.slug, name: d.businessName, template: d.template }, { revision: 1 });
await mkdir(out + '/data/vitrines/guavira-fotos', { recursive: true });
await writeFile(out + '/data/vitrines/guavira-fotos/menu.json', c.json);
await mkdir(out + '/guavira-fotos', { recursive: true });
await writeFile(out + '/guavira-fotos/index.html', renderStorefrontHtml(c.menu, await readFile(out + '/vitrine/index.html', 'utf8')));
"
python3 -m http.server 4199 --bind 127.0.0.1 --directory /tmp/guavira-preview
# abrir http://127.0.0.1:4199/guavira-fotos/
```

## 3. Passo a passo no painel (depois de `BLK-GUAVIRA-01`)

1. **Criar a vitrine:** área "Fotografia & mídia", modelo "Agendamento de Serviços",
   endereço `guavira-fotos`, nome "Guavira Fotos". Responsável: a própria Guavira
   (dona) ou um operador com acesso à equipe da vitrine.
2. **Configurações:**
   - WhatsApp comercial autorizado (formato internacional, só números). Se a Guavira
     preferir não expor o número, ligar "Receber pedidos pela Mila" (ADR 0012).
   - Seções na ordem do rascunho: abertura (título e subtítulo), serviços, sobre
     (apresentação e portfólio), horário e local, perguntas frequentes.
   - Instagram, se autorizado.
   - Depois do merge do #146: horário de funcionamento e endereço público (só se a
     Guavira autorizar mostrar o endereço; sem endereço não aparece "Traçar rota").
3. **Categorias:** "Ensaios" e "Pacotes" (ou os blocos que a Guavira indicar).
4. **Itens:** um por serviço ou pacote autorizado, com nome, descrição curta,
   duração e preço. Fotos pelo botão do item: a conversão para WebP ≤ 200 KB é
   automática; confirmar o tamanho mostrado ("Foto enviada (… KB)").
5. **Pedido e mensagem:** texto de boas-vindas (vira a descrição do cartão de
   prévia), rótulo do botão e modelo da mensagem do WhatsApp; conferir em "Prévia da
   mensagem no WhatsApp".
6. **Prévia:** conferir a prévia ao vivo e a prévia assinada (não indexada) em
   1280 e 375 px antes de publicar.
7. **Salvar rascunho → Publicar vitrine.** Abrir
   `https://vitrine.inspira.dev.br/guavira-fotos` em 1280 e 375 px e fazer as
   capturas do PR.

## 4. Checklist de publicação

- [ ] `BLK-GUAVIRA-01`: autorização escrita da Guavira recebida e arquivada fora do
      repositório; no PR, registrar só data, papel de quem autorizou e escopo
      (vitrine, case, Possibilidades, capturas), sem documento nem contato.
- [ ] Nenhum marcador `[a preencher com o conteúdo autorizado]` restante na vitrine.
- [ ] Fotos em WebP ≤ 200 KB (ADR 0011), com texto alternativo no nome do item.
      Fotos de clientes só com autorização de imagem das pessoas retratadas.
- [ ] Textos revisados pela Guavira (serviços, preços, prazos, perguntas).
      Terminologia: sempre "vitrine"; nunca "catálogo" ou "cardápio".
- [ ] Cartão de prévia conferido: colar o link num aplicativo de mensagens e
      verificar título, descrição (texto de boas-vindas) e imagem.
- [ ] Link do WhatsApp abre a conversa certa num aparelho, com a mensagem montada,
      **sem enviar**.
- [ ] Capturas em 1280 e 375 px anexadas ao PR.
- [ ] Case e Possibilidades atualizados (seção 5) e `npm test` passando.

## 5. Quando a autorização chegar

1. Montar e publicar a vitrine no painel (seção 3) e cumprir o checklist (seção 4).
2. **Case em `content/portfolio.json`:** a entrada `guavira-fotos` já existe com
   `"published": false` e `"authorization": "pendente: BLK-GUAVIRA-01"`.
   - Trocar `summary` pelo texto autorizado (até 600 caracteres, só o trabalho
     realizado), revisar `tags` e `order`.
   - Remover o campo `authorization` (ou trocar por `"BLK-GUAVIRA-01 registrada no PR #…"`).
   - Mudar `published` para `true`.
   - O teste `test/guavira-piloto.test.mjs` falha enquanto houver marcador ou
     `authorization` começando com "pendente" num case publicado; ajustar os testes
     que exigem `published: false` e a ausência de "guavira" em `dist/`.
3. **Possibilidades:** salvar a captura da vitrine publicada em
   `web/assets/showcase/guavira.jpg` (1280 × 900, como as demais) e colar o trecho
   abaixo no painel "Fotografia & mídia" de `web/possibilidades/index.html`, depois
   do exemplo da Nathália Verri.
4. Rodar `npm test`, `npm run build` e `npx wrangler deploy --dry-run`. Abrir PR com
   `Closes #124`.

Trecho pronto para colar em `web/possibilidades/index.html` (área
`#area-photo`, dentro de `.area-examples`):

```html
<a class="area-example example-preview" href="https://vitrine.inspira.dev.br/guavira-fotos" target="_blank" rel="noopener noreferrer">
  <img src="../assets/showcase/guavira.jpg" width="1280" height="900" alt="Prévia da vitrine Guavira Fotos" loading="lazy">
  <span>Guavira Fotos<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg><span class="visually-hidden"> (abre em nova aba)</span></span>
</a>
```

Possibilidades não tem mecanismo de rascunho: os exemplos são HTML estático com
captura local (spec 015 e `docs/marketing-design.md`). Por isso o trecho fica só
neste guia até a autorização; colá-lo antes publicaria a Guavira no site.

## 6. Fora de escopo

- Domínio próprio da Guavira (plano Essencial e #44).
- Outros portfólios: uma issue por cliente, quando autorizados.
