# Especificação: site de divulgação

Data: 2026-11-07. Direção A aprovada pelo usuário; implementação autorizada.
Escopo exclusivo: divulgação pública. Painel, login, editor e cobrança ficam fora.

## Cenários

- **US1**: visitante entende o produto, vê demonstração identificada e encontra
  possibilidades e funcionamento; links de navegação chegam à seção correta.
- **US2**: visitante compara oferta e customização sem confundir proposta em
  preparação com cadastro, contratação ou publicação já disponíveis.
- **US3**: equipe configura contato e cases públicos sem expor rascunhos ou dados
  administrativos; sem telefone, nenhuma ação aponta para número fictício.

## Requisitos

FR-001: composição A, marca e fontes oficiais; desktop e celular.
FR-002: menu utilizável com teclado, foco visível, Escape e FAQ expansível.
FR-003: contato configurável por content/contact.json; cases por catálogo revisado.
FR-004: gerar pacote estático apenas com arquivos públicos; sem SQL, testes ou segredos.
FR-005: preservar avisos de preparação, exemplos fictícios e preços não contratáveis.
FR-006: ativos locais, sem analytics, chat, dependência de CDN ou serviço pago.
FR-007: build e configuração de publicação Cloudflare sem provisionar recursos.

## Aceite

Sem overflow a 390 px e 1440 px, imagens/fontes carregadas, menu/FAQ funcionais,
portfólio vazio oculto, contato ausente explicado e pacote público validado.
Incluir contraste, redução de movimento e revisão visual no registro de QA.
