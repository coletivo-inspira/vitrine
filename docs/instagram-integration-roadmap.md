# Instagram → Vitrine → Ganja: caminho das pedras

Data: 12/11/2026. Status: mapeamento inicial; sem código de integração, configuração Meta ou deploy nesta entrega. As issues permanecem abertas para resolver pendências e detalhar as etapas antes da implementação.

## Objetivo e fluxo

Dono entra no painel → seleciona sua vitrine → conecta e autoriza o Instagram → servidor sincroniza → site exibe as publicações. Vitrine concentra integração e administração; Ganja é o primeiro consumidor.

## Receita de configuração e implementação futura

1. Confirmar que @ganjastudio.br usa conta profissional (Empresa ou Criador), identificar responsável pelo app Meta e uma conta de teste.
2. No console Meta, criar/configurar o app com Instagram Login; mapear a permissão mínima de leitura instagram_business_basic. Registrar IDs públicos e responsáveis, nunca tokens ou segredos.
3. Cadastrar retorno HTTPS do OAuth e páginas de privacidade/exclusão; mapear revogação e desconexão. Confirmar revisão, acesso para contas externas e verificações exigidas no console antes de liberar clientes.
4. Integrar “Conectar Instagram” à vitrine selecionada no painel. A sessão do painel identifica o dono; o consentimento Instagram autoriza a leitura. Validar acesso no servidor e proteger o retorno OAuth contra troca de conta/vitrine.
5. Definir executor/agendamento sobre a arquitetura Cloudflare/Supabase já escolhida. Confirmar infraestrutura operacional, cotas, frequência e proteção/renovação dos tokens. Não contratar planos nem fazer upgrade automático.
6. Importar perfil e mídias com paginação; sincronizar novidades e alterações sem duplicar; tratar posts removidos, URLs de mídia expiradas, falhas, limites e necessidade de reconexão.
7. Entregar somente projeção pública para os sites, compatível com publicação/cache existentes. Separar dados privados; o navegador nunca consulta o Instagram com credenciais do cliente.
8. Adaptar Ganja e executar o roteiro do piloto antes da liberação.

## Premissas e limites

Uma conta Instagram por vitrine; leitura de perfil/feed; autorização oficial pelo dono; sincronização periódica sem promessa de tempo real. Informar o link do perfil não substitui a autorização. “Todas as fotos” significa todo conteúdo acessível pela API, consultado com paginação. Mensagens ficam fora da primeira entrega. Nenhum segredo deve entrar em documentos, frontend ou logs.

## Tarefas e dependências

- [vitrine #48 — Mapear configuração Meta para integração Instagram](https://github.com/coletivo-inspira/vitrine/issues/48)
- [vitrine #49 — Planejar Conectar Instagram no painel por vitrine](https://github.com/coletivo-inspira/vitrine/issues/49)
- [vitrine #50 — Planejar sincronização periódica do perfil e feed Instagram](https://github.com/coletivo-inspira/vitrine/issues/50)
- [vitrine #51 — Definir interface pública do feed para sites conectados](https://github.com/coletivo-inspira/vitrine/issues/51)
- [vitrine #52 — Mapear mensagens no Instagram como evolução futura](https://github.com/coletivo-inspira/vitrine/issues/52)
- [ganja #4 — Planejar substituição das imagens fixas pelo feed Instagram](https://github.com/coletivo-inspira/ganja/issues/4)
- [ganja #5 — Planejar página do feed e acesso à gestão no Vitrine](https://github.com/coletivo-inspira/ganja/issues/5)
- [ganja #6 — Definir validação do piloto Instagram com Ganja](https://github.com/coletivo-inspira/ganja/issues/6)

Sequência: Meta → conexão no painel → sincronização → interface pública → Ganja → validação. Mensagens são uma trilha futura, sem bloquear o feed.

## Pendências a esclarecer

| Pendência | Onde resolver | Responsável a confirmar |
| --- | --- | --- |
| Tipo da conta e acesso ao app Meta | Vitrine #48 | Dono da marca + administrador Meta |
| URLs de retorno, privacidade/exclusão, revisão e acesso externo | Vitrine #48 | Administrador Meta + equipe Vitrine |
| Executor, agendamento, proteção de segredos, cotas e intervalo | Vitrine #50 | Equipe Vitrine |
| Tipos de mídia, histórico acessível e retenção/exclusão | Vitrine #50 | Equipe Vitrine + dono da marca |
| Contrato, publicação e cache público | Vitrine #51 | Equipe Vitrine |

A estrutura Cloudflare/Supabase é uma base aprovada no repositório, não evidência de que a integração ou a configuração remota já existe. Detalhar a futura especificação/implementação pelo fluxo Spec Kit existente, alinhado às specs 008/009; este documento é apenas pesquisa e roteiro inicial.

## Interface a definir e validação

Contrato de leitura: identidade pública do perfil, identificador/tipo da mídia, URL de exibição/capa, legenda, permalink, data e paginação. Rotas, formato final, frequência e política de cache serão definidos nas issues; não há API nova nesta entrega.

Aceite futuro: consentimento/cancelamento; duas vitrines isoladas; importação com múltiplas páginas; nova publicação no ciclo previsto; repetição sem duplicatas; fotos/carrosséis/vídeos; conta vazia; falha/limite de API; expiração/revogação; reconexão; desconexão/exclusão; ausência de segredos nas respostas públicas.

## Referências

- [API com Instagram Login — coleção oficial Meta](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login): contas profissionais e permissões; confirmar requisitos operacionais no console ao executar #48.
- [Arquitetura do Vitrine](architecture.md), [roadmap](roadmap.md) e specs 008/009.
- [Roteiro do piloto Ganja](https://github.com/coletivo-inspira/ganja/blob/codex/instagram-integration-roadmap/docs/instagram-integration-roadmap.md).
