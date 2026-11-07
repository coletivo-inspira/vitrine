# Node.js, dependências e segurança

Revisão em 2026-11-07. Escopo: runtime de desenvolvimento, dependências npm,
workflow e coerência da documentação. Não equivale a auditoria de produção.

## Versão adotada

Node **24 LTS**, mínimo **24.22.2** e sempre a correção mais recente da linha 24.
`package.json` restringe a `>=24.22.2 <25`; `.npmrc` usa engine-strict para impedir
instalação com versões fora dessa faixa. `.node-version` contém 24; o CI verifica
a correção mais recente em cada execução. A faixa não garante que versões futuras
sejam isentas de falhas: o mínimo deve ser elevado quando necessário.

Node 22 permanece suportado nesta data, mas em manutenção; não é automaticamente
inseguro por ser 22. Node 24 também recebe correções. Escolhemos uma linha LTS
consistente, em vez de aceitar indiscriminadamente qualquer versão acima de 22.
Node 26 já é LTS, mas não é necessário migrar a linha principal para validar esta
base. Fonte: [cronograma oficial](https://github.com/nodejs/Release/blob/main/schedule.json).

Na máquina, o Node global encontrado foi **24.12.0**, anterior às correções recentes.
Os testes desta revisão usam uma distribuição oficial portátil **24.22.2** para
Windows x64, com SHA-256 conferido contra o arquivo oficial. Não alteramos a
instalação global nem outros projetos. Para executar normalmente, atualizar o
Node instalado pela [distribuição oficial 24](https://nodejs.org/en/blog/release/v24.22.2)
ou pelo gerenciador já utilizado; conferir `node --version` antes de `npm ci`.

## Avisos de segurança vigentes

A atualização de outubro corrigiu falhas em 22, 24 e 26; nesta consulta a correção
24 mais recente é 24.22.2. Existe anúncio de uma nova atualização para **11/11/2026**,
com gravidade máxima HIGH nas três linhas. Em 07/11 essa atualização ainda não
está disponível; atualizar novamente após sua publicação. Não afirmar que esta
revisão eliminou essas falhas ou que mudar apenas a versão principal as resolve.
[Correções de outubro](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
[aviso de novembro](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases).

## Dependências verificadas

| Componente | Estado verificado | Uso |
| --- | --- | --- |
| @electric-sql/pglite | 0.5.15, versão mais recente no npm na consulta; fixada no lockfile | Somente testes locais |
| Dependências de produção npm | Nenhuma declarada | Bibliotecas locais usam módulos nativos |
| actions/checkout | v7.0.1, SHA verificado e fixado | Checkout sem persistir credencial |
| actions/setup-node | v7.1.0, SHA verificado e fixado | Instala Node 24 atualizado no CI |
| Spec Kit | 0.11.3 registrado no setup | Arquivos de suporte, não dependência npm nem runtime publicado |

PGlite não declarou dependências transitivas de runtime no pacote instalado.
`npm audit` retornou **zero vulnerabilidades conhecidas** em todas as dependências
instaladas. Esse resultado não audita o binário Node, GitHub Actions, scripts do
Spec Kit, Postgres embarcado ou serviços remotos de forma completa. Sem promessa
de ausência de vulnerabilidades. Sources do pacote:
[PGlite](https://github.com/electric-sql/pglite/blob/main/packages/pglite/package.json).

O alerta anterior das Actions tratava de Node 20 interno às versões v4 das ações;
isso é independente do Node 22 usado para rodar o projeto. As ações adotadas usam
Node 24 internamente. [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0).

## Validação e manutenção

Com Node 24.22.2 e npm 11.19.1: `npm ci`, `npm audit`, `npm test` e `npm run demo`.
Suíte atual: 23 testes contabilizados (um agrupador, dez cenários de banco, cinco de
projeção, seis de portfólio e um de empacotamento da divulgação). A auditoria npm é consulta pontual ao registro.

CI usa permissão de leitura, ações fixadas por SHA, instalação pelo lockfile,
auditoria que bloqueia vulnerabilidades altas/críticas e testes. npm ci também
verifica a integridade dos pacotes pelo lockfile. Dependabot foi configurado para
propor atualizações semanais de npm e Actions após chegar à branch padrão;
isso não atualiza nem faz merge automaticamente e não acompanha a versão Node
embutida no engine. O responsável deve revisar avisos Node e elevar o mínimo.

Node aqui executa ferramentas e testes, não um servidor público já implantado.
Cloudflare Workers usa runtime próprio; suporte a APIs Node depende de sua
compatibilidade e não é garantido pelos testes Node. O aceite integrado no
Supabase (OAuth, JWT e Data API) permanece pendente.

## Documentação corrigida nesta revisão

- README e plano agora concordam com a linha 24 e distinguem instalar/testar.
- Contagem atualizada de 16 para 22 e caminhos reais de migrações/testes.
- Documentado que slug já possui unicidade SQL, mas reserva de hostname não existe.
- Diferenciados limite comercial proposto de 20 itens e teto técnico de 100.
- Backup descrito como rotina planejada; painel, login e deploy seguem pendentes.
