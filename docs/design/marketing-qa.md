# Verificação da divulgação — 2026-11-07

Escopo: interface estática da divulgação, direção A. Não é aceite do portal completo.

## Verificações executadas

- Build com Node 24.22.2; teste de empacotamento exclui SQL, testes e fontes privadas.
- Suíte atual: 23 testes contabilizados, incluindo isolamento SQL e projeção pública.
- Wrangler 4.158.0 deploy --dry-run: sucesso, sem deploy ou bindings.
- Navegador IAB: viewport desktop 1440×1000 e celular 390×844, com fontes e imagens
  carregadas. Navegação mobile, Escape/foco, âncora Planos e FAQ exercitados.
- Contato ausente aparece em preparação; portfólio vazio oculto; sem destino fictício.
- Console inspecionado: nenhum aviso/erro observado nas interações exercitadas.

## Revisão visual independente

O revisor independente observou boa correspondência com A, hierarquia clara e
fidelidade de conteúdo. Encontrou overflow móvel de 4 px vindo do pseudo-elemento
de fundo do hero. O inset negativo foi limitado no breakpoint pequeno.

A tentativa de recaptura do revisor ficou indisponível no navegador. O agente
principal confirmou a correção em nova carga: celular clientWidth=375 e
scrollWidth=375; desktop clientWidth=1425 e scrollWidth=1425. Sem overflow nessas
duas capturas. Não apresentar isso como uma segunda aprovação independente.

Capturas de viewport foram utilizadas para aprovação visual; full-page apresentou
artefatos de wrapping/captura e não foi usado para julgar layout. Capturas estão
no histórico da conversa, não como arquivos do pacote publicado.

## Detector e acessibilidade

Detector executado uma vez. Alertas foram conferidos contra a página: mini-sites
contêm texto pequeno apenas demonstrativo/não interativo; wrappers de navegador
e seção têm filhos com seus próprios insets. Não contar ocorrências agregadas como
defeitos independentes. Corrigidos texto branco no bloco taupe da prévia e labels
funcionais pequenos. Detector não reexecutado após essa rodada.

Contraste dos tokens principais documentado na exploração da paleta; cores de
fundo sólido são estáveis. Foco visível, menu operável com teclado, hierarquia
semântica e redução de movimento na CSS/Orb. Não foi feita certificação completa
de acessibilidade, teste com leitor de tela, aparelho físico, Safari/Firefox ou
simulação instrumental de todas as preferências do sistema.

## Limites de entrega

Sem WhatsApp comercial informado, a página não gera pedidos de orçamento por
esse canal. Sem cases autorizados, não mostra a seção de portfólio real. Publicação
e teste de headers no domínio Cloudflare ainda pendentes. Nenhum dado administrativo,
cadastro, assinatura ou publicação de vitrine faz parte desta interface.
