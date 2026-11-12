---
status: accepted
---
# Sandboxing em origem opaca para componentes personalizados e extensões externas

## Contexto e Problema

A evolução da Vitrine Inspira prevê que clientes ou operadores autorizados possam incorporar componentes personalizados (HTML/CSS/JS sob medida ou widgets desenvolvidos em repositórios GitHub externos) sem modificar o núcleo compartilhado da plataforma. Executar HTML ou JavaScript customizado no mesmo documento ou na mesma origem das vitrines (`vitrine.inspira.dev.br`) ou do painel (`/portal/`) violaria os Princípios I, II e III da Constituição, abrindo brecha para Cross-Site Scripting (XSS), leitura do cookie `__Host-vitrine_session` e acesso cruzado aos dados de outros clientes.

## Opções Consideradas

1. **Injeção direta no DOM principal com sanitização por regex**: insegura; qualquer falha de sanitização compromete toda a origem compartilhada.
2. **Web Components / Shadow DOM na mesma origem**: o Shadow DOM isola apenas estilos CSS, mas compartilha o mesmo contexto global `window`, `document.cookie` e `origin`, não oferecendo barreira de segurança contra scripts.
3. **Arquitetura em 4 camadas com `<iframe>` em origem opaca (`sandbox="allow-scripts"` sem `allow-same-origin`) servido por hostname isolado**: manter o núcleo da vitrine 100% declarativo (JSON + CSS Custom Properties seguras) e confinar qualquer HTML/JS personalizado ou componente externo de GitHub a um `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">` com CSP restritiva e comunicação exclusiva por `postMessage` validado por schema.

## Decisão

Adotamos a **Opção 3**.

1. **Customizações padrão são declarativas**: temas, cores, fontes homologadas, reordenação de seções, páginas adicionais e módulos de negócio (Cardápio/Produtos, Agendamento de Serviços, Portfólio/Orçamento) são representados exclusivamente como dados JSON validados e tokens CSS (`--surface-*`, `--accent-*`), renderizados pelo motor nativo com escape completo de texto e `script-src 'self'`.
2. **Isolamento de código personalizado em origem opaca (`null`)**:
   - Quando uma vitrine utiliza um componente customizado em HTML/CSS/JS ou integrado a partir de um repositório GitHub externo aprovado por Operador Inspira, o componente é carregado em um `<iframe>` apontando para rota/subdomínio isolado (`sandbox.inspira.dev.br`) com o atributo `sandbox="allow-scripts"` (**nunca** `allow-same-origin`).
   - Sem `allow-same-origin`, o navegador atribui ao iframe uma origem criptográfica opaca (`null`), tornando impossível ler cookies (`__Host-vitrine_session`), acessar `localStorage`/`IndexedDB` da plataforma, chamar a API autenticada do portal ou inspecionar o DOM da vitrine hospedeira.
   - A troca de eventos com a vitrine (ex.: altura do bloco ou item selecionado para o pedido WhatsApp) ocorre apenas via `window.postMessage` com validação estrita de payload no hospedeiro.

## Consequências

- **Positivas**: permite extensibilidade real e projetos sob medida em repositórios externos sem risco de execução arbitrária de scripts na origem da plataforma; preserva a CSP `script-src 'self'` do portal e das vitrines públicas.
- **Negativas / Trade-offs**: componentes em iframe possuem retângulo visual próprio e não podem manipular diretamente elementos fora do seu contêiner.
