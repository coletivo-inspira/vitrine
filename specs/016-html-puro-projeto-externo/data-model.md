# Modelo de dados: HTML puro, projeto externo e administração por cliente (`016`)

Proposta para as migrações novas (nenhuma foi escrita nesta fase). Convenções do repositório:
migrações append-only com prefixo `YYYYMMDDHHMMSS` posterior a `20261116001800`
(`scripts/check-migration-order.mjs`, `test/migration-order.test.mjs`), RLS habilitada antes de
qualquer `grant`, funções `security definer` com `set search_path = ''`, gravação de auditoria por
`private.record_audit_log` e testes em PGlite (`test/database/`). Decisões em
[research.md](research.md).

Migrações previstas, nesta ordem. Os nomes são provisórios: cada arquivo recebe a versão no PR da
fase que o introduz, sempre maior que a última migração do `main` naquele momento
([plan.md](plan.md), "Ordem de entrega por fases").

| Arquivo | Fase | Conteúdo |
| --- | --- | --- |
| `20261121000100_client_customizations_notices.sql` | 1 (Fundação) | `client_customizations`, `panel_notices`, auditoria |
| `20261121000200_html_packages.sql` | 1 (Fundação, mínima) | `plans.max_html_packages`, pacotes, versões, conteúdo, revisões, controles por vitrine, cotas, RPCs de envio, revisão, leitura e uso; cópia de `custom_components` |
| `20261121000300_external_project_links.sql` | 6 (US4) | vínculos, configurações, comprovações, tentativas, `public_showcase_overrides`, métrica `external_redirect` |
| `20261121000400_admin_clients.sql` | 7 (US5) | `admin_list_clients`, `admin_read_client`, `read_platform_overview` com uso de HTML |

## 1. Customização contratada (`public.client_customizations`)

Registro, por cliente e vitrine, de uma customização com vigência (FR-046). Libera o projeto
externo (FR-032) e o envio de pacotes pelo operador sem plano (FR-048, FR-060).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | `gen_random_uuid()` |
| `tenant_id` | `uuid` null → `tenants` | cliente com organização |
| `owner_user_id` | `uuid` not null → `auth.users` | dono da vitrine (cliente sem organização usa só este) |
| `site_id` | `uuid` not null → `sites` on delete cascade | vitrine coberta |
| `kind` | `text` | `external_project` (Projeto externo), `html_bespoke` (Conteúdo HTML sob medida), `other` |
| `starts_on` / `ends_on` | `date` / `date` null | `ends_on >= starts_on`; nulo = sem fim |
| `ended_at` | `timestamptz` null | encerramento antecipado pelo operador |
| `source_request_id` | `uuid` null → `customization_requests` on delete set null | pedido de origem |
| `internal_note` | `text` | até 1000 caracteres; nunca exibida ao proprietário |
| `created_by`, `created_at`, `updated_at` | | |

- **Vigente** (`private.customization_in_force(site, kind)`): `starts_on <= hoje` e
  (`ends_on` nulo ou `hoje <= ends_on + 7 dias`) e `ended_at` nulo ou `now() <= ended_at + 7 dias`
  (tolerância de 7 dias da spec, mesma regra de `CONTEXT.md` "Tolerância").
- Índice único parcial: uma customização do mesmo `kind` vigente por vitrine.
- **RLS**: `platform_admin` lê e escreve tudo. Proprietário e equipe da vitrine leem `kind`,
  `starts_on`, `ends_on` e situação das suas vitrines por RPC `read_site_customizations(site)`
  (sem `internal_note`).
- **Auditoria**: `customization_created`, `customization_updated`, `customization_ended`
  (`entity_type = 'client_customization'`), com valores anterior e novo em `summary`.

## 2. Aviso no painel (`public.panel_notices`)

Não há e-mail (ADR 0005). Toda decisão que a spec manda "avisar" vira um aviso aqui e um registro
de auditoria.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `site_id` | `uuid` not null → `sites` on delete cascade | |
| `audience` | `text` | `owner` (dono e admins da vitrine) ou `operator` (`platform_admin`) |
| `kind` | `text` | lista fechada: `html_version_approved`, `html_version_changes_requested`, `html_version_rejected`, `html_version_withdrawn`, `html_uploads_suspended`, `external_link_suspended_ownership`, `external_link_suspended_loop`, `external_link_target_down`, `external_link_auto_disabled`, `external_link_activated`, `external_link_deactivated` |
| `payload` | `jsonb` | ≤ 2 KiB; só ids, nomes de pacote, versão, motivo e próximo passo; sem dados pessoais |
| `created_at`, `read_at` | | `read_at` atualizável por quem pode ler |

- **RLS**: `owner` visível a `has_site_role(site_id, ['owner','admin'])`; `operator` só a
  `platform_admin`. Inserção só por funções `security definer` (nunca pelo cliente).
- **Retenção**: apagar avisos lidos com mais de 90 dias no Cron (função `purge_panel_notices`).

## 3. Pacote HTML (`public.html_packages`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | o `packageId` das referências |
| `site_id` | `uuid` not null → `sites` on delete cascade | vitrine dona |
| `name` | `text` | 1–80 caracteres, sem marcação (`assertNoDangerousTextPayload`) |
| `description` | `text` | até 280 caracteres |
| `origin` | `text` | `owner` (dono ou admin da vitrine) ou `operator` (sob `html_bespoke`, FR-048) |
| `created_by`, `created_at`, `deleted_at` | | exclusão lógica só fora de uso (US6-4) |

- **Ativo** (FR-058): tem alguma versão `pending_review`, `approved` ou em uso. Pacotes `origin =
  'operator'` não contam no limite enquanto houver `html_bespoke` vigente.
- **Gatilho de limite**: em dois pontos, ambos com `pg_advisory_xact_lock` por vitrine, conferir
  `'html_packages' = any(private.site_entitlements(site).features)` e
  `count(ativos) < plans.max_html_packages`, senão `PLAN_FEATURE_REQUIRED` / `HTML_PACKAGE_LIMIT`:
  (1) ao inserir pacote `origin = 'owner'`; (2) na transição `ready → pending_review` de uma versão
  cujo pacote `origin = 'owner'` ainda não está ativo. Sem o ponto (2), pacotes em `ready` (que não
  contam como ativos) poderiam ser criados além do limite e enviados para revisão depois. Novas
  versões de pacotes já ativos não passam pela conferência (US1-8). O Worker confere antes e
  responde no formato do tópico 9 da pesquisa.
- **Exclusão** (US6-4): recusada com `HTML_PACKAGE_IN_USE` e a lista de páginas e blocos quando
  alguma versão está no rascunho ou no snapshot atual; fora de uso, apaga versões e conteúdo.

## 4. Versão do pacote (`public.html_package_versions`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | o `versionId` das referências |
| `package_id` | `uuid` not null → `html_packages` on delete cascade | |
| `site_id` | `uuid` not null | cópia para RLS e unicidade |
| `number` | `integer` | sequencial por pacote, a partir de 1 ("versão 2") |
| `sha256` | `text` | `^[a-f0-9]{64}$` |
| `byte_size` | `integer` | 1–524288 |
| `state` | `text` | ver máquina de estados |
| `report` | `jsonb` | ≤ 16 KiB: `errors[]`, `warnings[]` (`code`, `line`, `column`, `host?`), `info` (`hosts`, `forms`, `sendsResize`) |
| `external_hosts` | `text[]` | subconjunto de `cdn.tailwindcss.com`, `fonts.googleapis.com`, `fonts.gstatic.com` |
| `declaration` | `jsonb` | `{ rightsHolder: true, noVisitorData: true, acceptedAt, acceptedBy }` (FR-009) |
| `uploaded_by`, `uploaded_at` | | |
| `submitted_at` | `timestamptz` null | envio para revisão |
| `decided_by`, `decided_at`, `decision_reason` | | motivo obrigatório em `changes_requested`, `rejected`, `withdrawn` (até 1000 caracteres) |
| `content_purged_at` | `timestamptz` null | quando o conteúdo foi apagado pela retenção |

- **Unicidade**: `unique (site_id, sha256)` — reenviar o mesmo arquivo na mesma vitrine devolve a
  versão existente e sua situação (FR-005, US3-4); o mesmo arquivo em outra vitrine é outra versão.
- **Limites** (FR-010): no máximo 5 versões `approved` por pacote (a sexta é recusada com
  `HTML_VERSION_LIMIT` e a orientação de excluir versões fora de uso; nada aprovado é apagado
  sozinho); cota de 3 MiB por vitrine e 100 MiB globais somando `byte_size` das versões com
  conteúdo (`HTML_STORAGE_QUOTA`).
- **Derivados, não gravados**: "Em uso" = `approved` e referenciada no snapshot publicado atual da
  vitrine (`private.html_versions_in_use(site)` lê `publications.menu` por `jsonb_path_query`);
  "Aprovada, fora de uso" = `approved` e não referenciada.

### Máquina de estados da versão

```text
envio ──validação──▶ has_errors            (terminal; sem conteúdo; apagada em 30 dias)
      └──────────▶ ready ──"Enviar para revisão"──▶ pending_review
pending_review ──Aprovar──────────▶ approved
pending_review ──Pedir ajustes──▶ changes_requested   (terminal; conteúdo apagado em 30 dias)
pending_review ──Recusar────────▶ rejected            (terminal; conteúdo apagado em 30 dias)
approved ──Retirar do ar──────────▶ withdrawn          (terminal)
```

| Estado | Rótulo (FR-006) | Pode ir à prévia autenticada | Pode ir ao ar |
| --- | --- | --- | --- |
| `has_errors` | Com erros | não | não |
| `ready` | Pronta para revisão | sim | não |
| `pending_review` | Aguardando revisão | sim | não |
| `changes_requested` | Ajustes pedidos | sim (até a retenção) | não |
| `rejected` | Recusada | não | não |
| `approved` | Aprovada / Em uso / Aprovada, fora de uso | sim | sim, se a vitrine tiver o recurso ou `html_bespoke` vigente |
| `withdrawn` | Retirada do ar | não | não ("Conteúdo indisponível") |

- Transições só por RPC: `submit_html_version` (dono/admin da vitrine, ou operador para
  `origin = 'operator'`; para pacote `origin = 'owner'` ainda não ativo, confere recurso e limite
  como no gatilho de limite da seção 3 e recusa com `PLAN_FEATURE_REQUIRED`,
  `feature: "html_packages_limit"`), `decide_html_version` (`platform_admin`; para versões `origin =
  'operator'`, `decided_by <> uploaded_by` quando existir mais de um `platform_admin`, FR-048),
  `withdraw_html_version` (`platform_admin`). Uma versão aprovada pode ser publicada, despublicada
  e republicada sem nova revisão (FR-007). Voltar a uma versão aprovada (US6-3) não muda o estado.
- **Retirar do ar** também apaga o cache da borda por melhor esforço; a garantia de 5 minutos vem da
  revalidação de 300 s ([contracts/sandbox-embed-http.md](contracts/sandbox-embed-http.md)).

## 5. Conteúdo (`private.html_package_contents`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `version_id` | `uuid` pk → `html_package_versions` on delete cascade | |
| `content` | `text` | `octet_length(content) between 1 and 524288` |

Esquema `private`, sem `grant` para `anon`/`authenticated`. Escrita só por
`submit_html_package_upload` (`security definer`, valida papel, plano, limite, cotas e hash
recebido do Worker). Leitura só por:

- `public.read_html_version(version_id, sha256)` — `anon`: devolve `content`, `external_hosts` e
  os domínios próprios ativos da vitrine **somente** se `state = 'approved'` e a vitrine pode
  exibir HTML (`private.site_html_enabled(site)`: recurso `html_packages` ou `html_bespoke`
  vigente) e não está arquivada.
- `public.html_version_servable(version_id, sha256)` — `anon`: só o booleano acima, para a
  revalidação do cache.
- `public.service_read_html_version(version_id)` — só `service_role`: para a prévia autenticada e
  a revisão (versões `ready`, `pending_review`, `changes_requested`), chamada pelo Worker depois de
  conferir o token assinado.

## 6. Revisão (`public.html_package_reviews`)

Histórico imutável das decisões (FR-028, FR-031).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `version_id` | `uuid` → `html_package_versions` | |
| `site_id` | `uuid` | |
| `decision` | `text` | `approve`, `request_changes`, `reject`, `withdraw` |
| `reason` | `text` | obrigatório exceto em `approve` |
| `checklist` | `jsonb` | `{ coherentWithBusiness, noPersonalDataOrPasswords, noThirdPartyImpersonation, allowedByTerms }`, todos `true` para `approve` |
| `reviewer_id`, `created_at` | | |

**RLS**: `platform_admin` lê tudo; dono e admins da vitrine leem `decision`, `reason`, data e se o
revisor foi um Operador Inspira (sem o id do revisor) por `list_html_packages(site)`.

## 7. Controles por vitrine (`public.html_site_controls`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `site_id` | `uuid` pk | |
| `uploads_suspended_at`, `uploads_suspended_by`, `uploads_suspended_reason` | | suspensão por reincidência (FR-029); só `platform_admin` |

Com suspensão, `submit_html_package_upload` recusa `HTML_UPLOADS_SUSPENDED` para dono e admins;
versões já aprovadas continuam como estão.

## 8. Referências no rascunho e no snapshot

Sem tabela nova: ficam em `drafts.content.structure` e no snapshot `publications.menu.structure`.

**Bloco HTML** (seção `custom_sandbox`, rótulo "Bloco HTML"):

```json
{
  "id": "orbit-bloco",
  "moduleCode": "custom_sandbox",
  "config": {
    "widgetId": "7a1c…",
    "versionId": "b2d4…",
    "bundleHash": "e888ce2a…d47c",
    "heightMode": "content",
    "title": "Simulador Orbit"
  }
}
```

- `widgetId` passa a significar `packageId` (nome mantido para não mudar rascunhos existentes);
  `versionId` (`uuid`), `heightMode` (`content` | `fixed`, padrão `content`) e `title` (até 80
  caracteres, nome acessível; padrão = nome do pacote) são novos.
- Até 3 blocos `custom_sandbox` ativos por página (FR-023), dentro do limite de 15 seções.

**Página HTML emoldurada**:

```json
{
  "slug": "prototipo-orbit",
  "title": "Protótipo Orbit",
  "kind": "html_frame",
  "active": true,
  "html": {
    "packageId": "7a1c…",
    "versionId": "b2d4…",
    "versionHash": "e888ce2a…d47c",
    "heightMode": "viewport",
    "description": "Experimente o protótipo interativo.",
    "showInMenu": true
  },
  "sections": []
}
```

- `kind` ausente = página nativa (comportamento atual). `heightMode`: `viewport` (Altura da tela,
  padrão) ou `content` (Altura do conteúdo). `description` até 160 caracteres. `slug` não pode ser
  `item` nem `home`. Conta no limite de 5 páginas.
- `showInMenu: true` faz o editor manter um item `{ label: title, href: "pagina:<slug>" }` em
  `navigationMenus.header`; o tipo `link` dos menus passa a aceitar `pagina:<slug>` (FR-053).
- **Projeção pública**: `projectShowcaseManifest` publica `kind`, `title`, `slug` e `html` sem
  `showInMenu`; `assertNoPrivateLeakage` continua recusando chaves fora da lista.
- **Publicação** (edge case "Publicação com versão não aprovada"): `assertApprovedWidgets` passa a
  conferir, para cada bloco e página, que `versionId` pertence ao `packageId` da vitrine, que o hash
  confere e que o estado é `approved`; senão `422 HTML_VERSION_NOT_APPROVED` com `targets:
  [{ page, sectionId? }]`. Se a vitrine não tem o recurso nem `html_bespoke`, `403
  PLAN_FEATURE_REQUIRED` só quando a mudança acrescenta conteúdo HTML (o que já estava salvo
  continua, como em `assertItemBlocksAllowed`).

## 9. Vínculo de projeto externo (`public.external_project_links`)

Um por vitrine (FR-032, FR-033).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `site_id` | `uuid` pk → `sites` on delete cascade | |
| `state` | `text` | `draft`, `awaiting_proof`, `ready_to_activate`, `active`, `suspended`, `disabled` |
| `suspended_reason` | `text` null | `ownership_not_confirmed` ("Suspenso: posse não confirmada") ou `loop_detected` |
| `active_config_id` | `uuid` null → `external_project_configs` | configuração em vigor (só com `state = 'active'`) |
| `pending_config_id` | `uuid` null → `external_project_configs` | configuração em preparação (troca de domínio com o vínculo ativo, FR-063) |
| `active_since` | `timestamptz` null | |
| `next_check_at` | `timestamptz` | fila do Cron; `now() + 24 h` depois de cada rodada |
| `last_check_at`, `last_check_result` | | `ok`, `ownership_failed`, `target_down`, `loop_detected`, `transient_error` |
| `consecutive_down_days` | `integer` | zera com `ok`; aviso no 3º dia (FR-041) |
| `last_attempt_at` | `timestamptz` null | limite de 1 "Verificar agora" a cada 30 s |
| `updated_by`, `updated_at` | | |

### Máquina de estados do vínculo

```text
(nenhum) ──operador salva destino válido──▶ draft
draft ──destino responde e não volta à plataforma (FR-035)──▶ awaiting_proof   (gera o código)
awaiting_proof ──comprovação válida (Verificar agora ou Cron)──▶ ready_to_activate
ready_to_activate ──comprovação deixa de valer antes de ativar──▶ awaiting_proof
ready_to_activate ──Ativar (confirmação + motivo + nova checagem)──▶ active
active ──Cron: posse negativa──▶ suspended (ownership_not_confirmed)
active ──Cron: laço detectado──▶ suspended (loop_detected)
active ──Desativar──▶ disabled
active ──customização encerrada + 7 dias (Cron)──▶ disabled
suspended ──nova comprovação válida──▶ ready_to_activate
disabled ──Restaurar configuração (comprovação ainda válida)──▶ active
disabled ──Restaurar configuração (comprovação inválida)──▶ awaiting_proof
qualquer ──customização não vigente──▶ edição bloqueada (só Desativar)
```

- **Troca de destino com o vínculo ativo** (FR-063, US4-10): mesmo host → nova configuração vira
  `active_config_id` na hora, depois da checagem de laço, sem nova comprovação; outro host → vira
  `pending_config_id` com comprovação própria; o vínculo continua `active` com o destino anterior
  até "Ativar" a pendente.
- `redirect` só existe para a vitrine pública quando `state = 'active'` **e**
  `customization_in_force(site, 'external_project')` **e** a comprovação do host da configuração
  ativa é `valid`.

## 10. Configuração do vínculo (`public.external_project_configs`)

Imutável; as últimas 5 por vitrine ficam guardadas (FR-040), nunca apagando a ativa nem a pendente.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `site_id` | `uuid` | |
| `target_url` | `text` | ≤ 2048; `https://`; regras de FR-034 conferidas no Worker e de novo por `check` (prefixo `https://`, sem `@` antes do host, sem `:porta`) |
| `target_host` | `text` | host em minúsculas e punycode |
| `target_host_display` | `text` | forma Unicode, para conferência (FR-034) |
| `scope` | `text` | `site` (Vitrine inteira) ou `page` (Página da vitrine) |
| `page_slug` | `text` null | obrigatório com `scope = 'page'`; slug de página existente no rascunho |
| `menu_open` | `text` | `same_tab` (padrão) ou `new_tab` |
| `operator_confirmed` | `boolean` | precisa ser `true` para ativar |
| `reason` | `text` | 3–500 caracteres |
| `created_by`, `created_at` | | |

Gatilho `prune_external_project_configs` (como `prune_publication_releases` na migração
`202611120006` l. 189–216) mantém as 5 mais recentes por vitrine mais as referenciadas.

## 11. Comprovação de posse (`public.domain_ownership_proofs`) e tentativas

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `site_id` | `uuid` | |
| `hostname` | `text` | host exato do destino (punycode) |
| `code` | `text` unique | `vitrine=<uuid>`, gerado por gatilho (como `private.issue_custom_domain_challenge`) |
| `txt_name` | `text` | `_vitrine-verify.<hostname>` |
| `file_url` | `text` | `https://<hostname>/.well-known/vitrine-inspira-verificacao.txt` |
| `state` | `text` | `pending`, `valid`, `failed` |
| `method` | `text` null | `dns` ou `file` (o que passou por último) |
| `verified_at`, `last_attempt_at`, `last_result` | | `ok`, `txt_not_found`, `txt_mismatch`, `file_not_found`, `file_mismatch`, `file_redirected_off_host`, `domain_unreachable`, `transient_error` |

- `unique (site_id, hostname)`: o código é por vínculo e domínio e não serve para outra vitrine
  (FR-061). Trocar o host cria outra comprovação.
- `private.domain_proof_attempts` (`proof_id`, `method`, `result`, `transient`, `created_at`):
  últimas 30 por comprovação, apagadas por gatilho; servem ao histórico da ficha e à auditoria.
- **RLS** de vínculo, configurações e comprovações: `platform_admin` lê e escreve por RPC;
  dono e equipe da vitrine leem por `read_external_project(site)` (estado, destino, alcance,
  desde quando, instruções e último resultado; sem `reason` interno nem autor), FR-042.

## 12. Estado público para a borda (`public.public_showcase_overrides`)

`security definer`, `anon`, por `slug`:

```json
{
  "paused": false,
  "htmlEnabled": true,
  "redirect": {
    "scope": "page",
    "pageSlug": "prototipo-orbit",
    "targetUrl": "https://orbit.cliente.com.br/",
    "menuOpen": "new_tab"
  }
}
```

Projeção explícita (Princípio I): sem ids internos, motivos, autores ou códigos de comprovação.
`redirect` é `null` fora das condições da seção 9.

## 13. Plano (`public.plans`) e Insights

- `public.plans.max_html_packages integer not null default 0 check (max_html_packages between 0
  and 5)`, semeada de `content/plans.json` (`limits.htmlPackagesPerVitrine`).
- `private.site_metric_names()` recriada com `external_redirect`. A linha diária segue
  `site_metrics_daily` (`source`, `campaign`, sem dados pessoais).

## 14. Retenção

| O quê | Regra | Onde |
| --- | --- | --- |
| Versões aprovadas | até 5 por pacote; nunca apagadas sozinhas | gatilho de envio |
| Versões `has_errors` | sem conteúdo; metadados apagados em 30 dias | `purge_html_package_versions` no Cron |
| Versões `rejected` / `changes_requested` | conteúdo apagado 30 dias depois da decisão (metadados e revisão ficam) | idem |
| Configurações do vínculo | 5 mais recentes + ativa + pendente | gatilho |
| Tentativas de comprovação | 30 por comprovação | gatilho |
| Avisos lidos | 90 dias | `purge_panel_notices` no Cron |
| Auditoria | regra existente (`purge_audit_logs_older_than`, 180 dias) | sem mudança |

## 15. Eventos de auditoria

`audit_logs.action` (até 80 caracteres) e `entity_type`:

| `entity_type` | `action` | `summary` mínimo |
| --- | --- | --- |
| `html_package` | `html_package_created`, `html_package_deleted` | `name`, `origin` |
| `html_package_version` | `html_version_uploaded`, `html_version_submitted`, `html_version_approved`, `html_version_changes_requested`, `html_version_rejected`, `html_version_withdrawn`, `html_version_rolled_back` | `packageId`, `number`, `sha256`, `reason?`, `from?`, `to?` |
| `html_site_controls` | `html_uploads_suspended`, `html_uploads_resumed` | `reason` |
| `external_project_link` | `external_link_saved`, `external_link_activated`, `external_link_deactivated`, `external_link_restored`, `external_link_suspended`, `external_link_auto_disabled` | `before`, `after` (destino, alcance, página, abertura), `reason`, `operatorConfirmed` |
| `domain_ownership_proof` | `ownership_check` | `hostname`, `method`, `result`, `trigger` (`manual` ou `cron`) |
| `client_customization` | `customization_created`, `customization_updated`, `customization_ended` | `kind`, `before`, `after` |

Ações do Cron (suspensão, desativação automática, verificação diária, retenção) gravam
`actor_user_id` nulo, já permitido desde `20261115000100_plans_subscriptions.sql` l. 91, com
`summary.source = 'system'`, como o ciclo da assinatura faz
(`20261116000100_subscription_lifecycle.sql` l. 8–45).

## 16. Componentes antigos (`public.custom_components`)

A migração de pacotes copia cada linha ativa de `custom_components` para um pacote `origin =
'operator'` com o **mesmo id** e uma versão `approved` com o mesmo hash, para que rascunhos com
`custom_sandbox` continuem válidos. `read_sandbox_bundle` continua existindo até a remoção da rota
antiga, numa migração posterior. `POST /api/admin/custom-components` passa a responder `410
ENDPOINT_REPLACED` apontando para a API de envio do operador.
