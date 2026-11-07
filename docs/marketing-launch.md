# Divulgação: executar e publicar

Estado: página implementada e validada localmente; nenhum deploy remoto ou DNS
alterado. Não inclui painel, Auth integrado, editor ou backend público.

## Ambiente e prévia

Node 24 LTS atualizado (mínimo 24.22.2). Na raiz:

```text
npm ci
npm test
npm run build
npm run preview
```

Abrir http://127.0.0.1:4173. O servidor é local (loopback), não acessível de fora.
`dist/` é gerado e ignorado pelo Git. Nunca publicar a raiz do repositório.
Para alterar a página, editar web/, executar build e recarregar a prévia.

## Conteúdo administrável inicial

- `content/portfolio.json`: somente projetos autorizados; published controla exibição,
  não sigilo (o repositório é público). Catálogo vazio não aparece na página.
- `content/contact.json`: teamWhatsapp recebe o número comercial internacional
  com DDI, só dígitos. null mantém contato indisponível. Não inserir token/API key.
- Rebuild necessário após editar os arquivos. O site recebe apenas projeções públicas.
- `web/assets/ASSETS.md`: origem das fontes, vetores e imagem demonstrativa.

Preço, datas e disponibilidade devem corresponder à operação real antes de
divulgar uma oferta ativa. A versão atual explica que o produto está em preparação.

## Cloudflare Free — preparação conferida

`wrangler.jsonc` configura apenas Static Assets, sem banco ou função de aplicação.
Com Wrangler 4.158.0 foi executado com sucesso:

```text
npx --yes wrangler@4.158.0 deploy --dry-run
```

Dry-run validou o pacote e a configuração sem publicar ou vincular domínio. A
ferramenta é executada pontualmente, não adiciona dependência à página. Verificar
avisos e atualizações antes de reutilizar a versão em data posterior.

## Publicação real — etapa ainda pendente

1. Usar conta Cloudflare autorizada no plano Free. Autenticar o Wrangler localmente
   por fluxo próprio; não enviar tokens na conversa nem versionar credenciais.
2. Executar o build e o dry-run. Confirmar que contato e oferta refletem o que deve
   estar público; se o telefone ainda faltar, publicar somente a apresentação.
3. Executar `npx --yes wrangler@4.158.0 deploy`. Conferir preview workers.dev, HTTPS,
   menu, imagens e links antes de associar domínio.
4. Na zona inspira.dev.br, conferir o hostname existente e associar o Worker ao
   Custom Domain exato vitrine.inspira.dev.br. Não alterar a raiz, sites atuais,
   email, tunnel ou criar wildcard. Não contratar planos ou recursos pagos.
5. Conferir HTTPS, 404, headers e conteúdo no domínio definitivo. Atualizar o estado
   de publicação em README. Preservar a versão anterior para rollback.

O _headers do pacote limita scripts/conexões à própria origem. style-src permite
inline para a Orb oficial (CSS injetado e variáveis de movimento); scripts inline
e eval permanecem bloqueados. Fontes locais evitam requisições a Google Fonts.
Não há analytics, formulário, tracker ou segredo no bundle.

Referência: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/).
