# Vitrine Inspira

Portal no qual pessoas administram suas vitrines e visitantes consultam sites publicados.

## Linguagem

**Site de divulgação**: Site público que apresenta a Vitrine Inspira e explica o produto; não é a vitrine de um negócio.

**Painel**: Área autenticada do portal onde as pessoas administram suas vitrines.

**Portal**: Ambiente central onde uma pessoa acessa e administra suas vitrines.
_Evitar_: vitrine para designar o ambiente administrativo.

**Vitrine**: Site individual de um negócio, criado a partir de um modelo.
_Evitar_: conta, portal.

**Proprietário**: Pessoa responsável por uma vitrine. Uma mesma pessoa pode ser proprietária de várias vitrines.

**Equipe da vitrine**: Conjunto de pessoas autorizadas a administrar uma vitrine específica. Participar de uma equipe não concede acesso às demais vitrines do proprietário.

**Membro**: Pessoa com acesso concedido a uma vitrine, sem assumir sua propriedade.

**Modelo**: Estrutura reutilizável que define as possibilidades de uma vitrine, como cardápio de pizzaria.
_Evitar_: negócio para designar o modelo.

**Rascunho**: Conteúdo de uma vitrine ainda não publicado.

**Publicação**: Versão do conteúdo disponibilizada aos visitantes.

**Item ativo**: Item do cardápio selecionado para aparecer na próxima publicação.

**Cota de apoio**: Parte igual de uma meta (equipamento, projeto ou lote de compra coletiva) reservada pelo visitante pelo WhatsApp. Toda cota garante o mesmo benefício declarado, sem sorteio, prêmio ou retorno financeiro; o pagamento é combinado direto com o proprietário. Ver `specs/014-cotas/research.md`.
_Evitar_: rifa, sorteio, bilhete, número da sorte.

**Assinatura**: Contratação periódica de benefícios para uma vitrine, como endereço personalizado; não equivale à compra de um domínio.

**Vínculo de domínio**: Associação de um endereço verificado à vitrine, sem transferência de propriedade do domínio.

**Customização**: Alteração específica de apresentação ou funcionalidade contratada com escopo próprio.

**Case**: Exemplo autorizado de um trabalho realizado, publicado no portfólio da Inspira.

**Mila**: Assistente da equipe Vitrine Inspira no WhatsApp. É uma pessoa, não um robô (ADR 0012). Faz a triagem de orçamentos e repassa ao dono os pedidos das vitrines com "Receber pedidos pela Mila" ligado.

**Código da vitrine**: Identificador público `#VI-XXXXXX-XXXX`, derivado do slug, que abre cada pedido enviado à Mila e permite localizar a vitrine sem expor o número do dono.

**Operador Inspira**: Pessoa da equipe responsável por portfólio, atendimento, CMS institucional e benefícios comerciais; não se confunde com proprietário de vitrine.

**Organização cliente (Inquilino / Tenant)**: Agrupador comercial de um cliente que pode possuir uma ou mais vitrines sob cotas controladas, mantendo o isolamento de acesso por vitrine.

**Módulo**: Bloco funcional reutilizável de uma vitrine (ex.: topo/hero, grade de catálogo, agendamento, depoimentos, FAQ, horários/localização, componente em sandbox).

**Seção**: Instância ordenada e configurada de um módulo dentro de uma página da vitrine.

**Prévia autenticada**: Visualização temporária e assinada (`noindex`) de um rascunho antes da publicação pública.

**Reversão (Rollback)**: Restauração imediata de uma das últimas versões publicadas da vitrine sem necessidade de novo deploy.

**CMS Institucional**: Área exclusiva dos Operadores Inspira no portal para atualizar banners, textos, seções, modelos e cases da página principal da plataforma sem alterar código.

**Sandbox de extensão**: Contêiner isolado em origem opaca (`<iframe sandbox="allow-scripts">` sem `allow-same-origin`) onde componentes personalizados em HTML/CSS/JS ou de repositórios externos executam sem acesso a cookies ou dados de outros clientes.

**Curtida**: Marcação anônima de um visitante em um item da vitrine publicada, contada no servidor uma vez por visitante e item; o visitante é lembrado só por um cookie funcional, sem login, IP ou dados pessoais.

**Regra de Terminologia**: Use sempre o termo "vitrine" (ou "itens da vitrine"), nunca "catálogo" ou "cardápio", para qualquer conteúdo visível ao usuário nas páginas de marketing.
