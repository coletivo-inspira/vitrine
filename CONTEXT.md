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

**Plano**: Conjunto de limites (vitrines, itens ativos por vitrine, blocos de itens) e recursos com preço mensal fixo: Gratuito/Social, Essencial, Profissional ou Equipe/Multi-Vitrine. A tabela única fica em `content/plans.json` (ADR 0013); nenhum plano passa de 100 itens ativos por vitrine.
_Evitar_: pacote, plano ilimitado.

**Assinatura**: Contratação periódica de um plano pela organização cliente, uma por cliente, com situação (pendente, ativa, em atraso, em tolerância, suspensa ou cancelada). Só muda com pagamento confirmado pelo operador de pagamento ou por ação auditada de um Operador Inspira; não equivale à compra de um domínio.

**Recurso do plano**: Capacidade paga liberada pelo plano e verificada no servidor, como domínio próprio, `vitrine.json` ou webhook de pré-orçamento. Sem o plano, a vitrine continua no ar com os recursos do Gratuito.

**Tolerância**: Prazo de 7 dias depois do vencimento em que a assinatura não paga mantém os recursos do plano. Ao fim dele, só os recursos pagos são suspensos; a vitrine volta ao endereço básico e nada é apagado.
_Evitar_: carência, bloqueio da vitrine.

**Vínculo de domínio**: Associação de um endereço verificado à vitrine, sem transferência de propriedade do domínio.

**Customização**: Alteração específica de apresentação ou funcionalidade contratada com escopo próprio.

**Case**: Exemplo autorizado de um trabalho realizado, publicado no portfólio da Inspira.

**Mila**: Assistente da equipe Vitrine Inspira no WhatsApp. É uma pessoa, não um robô (ADR 0012). Faz a triagem de orçamentos e repassa ao dono os pedidos das vitrines com "Receber pedidos pela Mila" ligado.

**Código da vitrine**: Identificador público `#VI-XXXXXX-XXXX`, derivado do slug, que abre cada pedido enviado à Mila e permite localizar a vitrine sem expor o número do dono.

**Operador Inspira**: Pessoa da equipe responsável por portfólio, atendimento, CMS institucional e benefícios comerciais; não se confunde com proprietário de vitrine.

**Operador de captação**: Operador Inspira que só cria demonstrações e convites de dono (`growth_operator`); não vê cobrança, CMS institucional nem vitrines com dono. Proposto na spec `018-convite-demonstracao`.

**Demonstração**: Vitrine sem dono montada por um Operador Inspira com o conteúdo público de um negócio, só em rascunho, nunca publicada antes do aceite e apagada em 30 dias (prorrogável até 90) se ninguém aceitar.
_Evitar_: vitrine temporária publicada, teste grátis.

**Convite**: Link de uso único e com prazo que dá a quem o aceita a propriedade de uma demonstração ou um papel na equipe de uma vitrine. O convite de dono abre uma prévia fora dos buscadores, sem login. O convite de equipe está implementado (spec `019-portal-forms-ux`); o de dono continua proposto na 018.

**Cortesia**: Concessão sem cobrança do plano Profissional por 90 dias, dada no aceite de uma demonstração, no máximo uma por conta. Não é assinatura; ao fim, a vitrine volta ao Gratuito sem perder nada.
_Evitar_: trial, período de teste.

**Início**: Tela de entrada do painel, no modelo do Google Forms: "Começar nova vitrine" (modelos) e "Vitrines recentes" (grade com busca). Substitui o Painel Inicial e Minhas Vitrines (spec `019-portal-forms-ux`).

**Abas da vitrine**: Itens (categorias como seções e cartões de item), Pedidos (Insights e Leilões só daquela vitrine) e Configurações (seções recolhíveis, incluindo Acesso com publicação, link e equipe).

**Paleta da vitrine**: Uma das 8 combinações de cores com contraste AA escolhidas em Personalizar e guardadas em `structure.theme.palette`; a cor de destaque própria (`accentColor`), quando existe, vale por cima da paleta.

**Funcionário**: Nome no painel do papel `editor` da equipe da vitrine: edita itens, blocos, fotos e rascunho, mas não publica nem mexe em configurações, equipe ou cobrança. Os outros papéis aparecem como Administrador (`admin`) e Somente leitura (`viewer`).

**Patrocinador**: Pessoa ou entidade que financia o plano Gratuito/Social por cota negociada fora do sistema. No painel tem só a tela Impacto, atribuída por um Operador Inspira; não abre vitrines, rascunhos nem a administração.

**Impacto**: Tela somente leitura do patrocinador com o número de vitrines sociais ativas (plano Gratuito/Social, não arquivadas) e suas visitas e cliques para enviar no WhatsApp somados por mês e por cidade, sem nome de negócio nem itens. Cidade com menos de 5 vitrines entra em "Outras cidades".

**Organização cliente (Inquilino / Tenant)**: Agrupador comercial de um cliente que pode possuir uma ou mais vitrines sob cotas controladas, mantendo o isolamento de acesso por vitrine.

**Módulo**: Bloco funcional reutilizável de uma vitrine (ex.: topo/hero, grade de catálogo, agendamento, depoimentos, FAQ, horários/localização, componente em sandbox).

**Seção**: Instância ordenada e configurada de um módulo dentro de uma página da vitrine.

**Prévia autenticada**: Visualização temporária e assinada (`noindex`) de um rascunho antes da publicação pública.

**Reversão (Rollback)**: Restauração imediata de uma das últimas versões publicadas da vitrine sem necessidade de novo deploy.

**CMS Institucional**: Área exclusiva dos Operadores Inspira no portal para atualizar banners, textos, seções, modelos e cases da página principal da plataforma sem alterar código.

**Sandbox de extensão**: Contêiner isolado em origem opaca (`<iframe sandbox="allow-scripts">` sem `allow-same-origin`) onde componentes personalizados em HTML/CSS/JS ou de repositórios externos executam sem acesso a cookies ou dados de outros clientes.

**Curtida**: Marcação anônima de um visitante em um item da vitrine publicada, contada no servidor uma vez por visitante e item; o visitante é lembrado só por um cookie funcional, sem login, IP ou dados pessoais.

**Página por cidade**: Página pública (`/por-cidade`) que reúne os itens de lance, doação e troca das vitrines publicadas que autorizaram aparecer na sua cidade; mostra só dados públicos da vitrine e dos itens, e o contato acontece na vitrine.

**Localidade da vitrine**: Cidade e UF informadas pelo proprietário em Ajustes, com autorização explícita para a página por cidade; não se confunde com a cidade do perfil pessoal.

**Leilão**: Item de lance com data de encerramento; os lances ficam registrados e o maior lance válido no encerramento vence. Item de lance sem data continua como oferta enviada pelo WhatsApp.

**Lance**: Valor oferecido por um visitante em um leilão, com nome e WhatsApp visíveis só para proprietário e administradores da vitrine.

**Lance desconsiderado**: Lance anulado pela equipe da vitrine com motivo registrado; o próximo maior lance válido passa a valer.

**Regra de Terminologia**: Use sempre o termo "vitrine" (ou "itens da vitrine"), nunca "catálogo" ou "cardápio", para qualquer conteúdo visível ao usuário nas páginas de marketing. Peças do Instagram podem nomear o modelo "Cardápio"; no site a mesma demonstração se chama "Pratos".

**Demonstração de modelo**: Animação ilustrativa de 4 s de um modelo (Pratos/Cardápio, Lanches, Serviços, Portfólio), com negócio e valores fictícios, usada na página Possibilidades e na campanha do Instagram.
