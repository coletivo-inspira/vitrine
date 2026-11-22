# Contrato: comprovação de posse do domínio de destino (`016`)

Quem chama: "Verificar agora" do operador e do proprietário
([external-project-api.md](external-project-api.md)), a ativação e a restauração, e o Cron
(`runExternalProjectChecks`). Implementação proposta em `src/external-project.mjs`, com a consulta
DNS compartilhada com `src/custom-domains.mjs`.

## Desafio

| Item | Valor |
| --- | --- |
| Host comprovado | host exato do destino, em minúsculas e punycode (`orbit.cliente.com.br`) |
| Código | `vitrine=<uuid>`, gerado no banco, único por vitrine e host (FR-061) |
| Registro DNS (preferido) | `TXT` com nome `_vitrine-verify.<host>` e valor exatamente igual ao código |
| Arquivo (alternativa) | `https://<host>/.well-known/vitrine-inspira-verificacao.txt` com o código como conteúdo |

## Método DNS

1. `GET https://cloudflare-dns.com/dns-query?name=_vitrine-verify.<host>&type=TXT` com
   `accept: application/dns-json` e tempo limite de 5 s.
2. `Status` 0 (NOERROR) ou 3 (NXDOMAIN) é resposta conclusiva; qualquer outro, erro HTTP, tempo
   esgotado ou JSON inválido é **erro temporário**.
3. Válido quando alguma resposta `type = 16` tem `name` igual ao nome pedido (sem ponto final,
   minúsculas) e `data` sem aspas externas igual ao código. Registros TXT divididos em partes
   (`"vitrine=" "3c1e…"`) são unidos antes da comparação.
4. Resultado: `ok`, `txt_not_found` (sem registro com esse nome) ou `txt_mismatch` (há registro, com
   outro valor).

## Método arquivo

1. `GET https://<host>/.well-known/vitrine-inspira-verificacao.txt` com `redirect: "manual"`,
   tempo limite de 5 s, sem cookies, `user-agent: VitrineInspira-Verificacao/1`.
2. Até 2 redirecionamentos, só para `https://` **no mesmo host**; qualquer outro destino →
   `file_redirected_off_host` (edge case "Arquivo servido por redirecionamento").
3. Só `200` vale. Lê no máximo 1 KiB; o conteúdo sem espaços e quebras nas pontas deve ser
   exatamente o código.
4. Resultado: `ok`, `file_not_found` (404/410 ou outro 4xx), `file_mismatch`,
   `file_redirected_off_host`, `domain_unreachable` (falha de conexão ou TLS) ou erro temporário
   (5xx, tempo esgotado).

## Ordem e repetição

- "Verificar agora", ativação e restauração: DNS primeiro; se não for `ok`, arquivo. O resultado
  mostrado é o do método mais próximo de passar (`*_mismatch` antes de `*_not_found`).
- Erro temporário: até 3 tentativas no mesmo método na mesma rodada; depois, `transient_error`, que
  **nunca** suspende um vínculo (FR-064) e nunca libera uma ativação.
- Limite: 1 tentativa manual a cada 30 s por vínculo (`429 OWNERSHIP_CHECK_RATE_LIMITED`).
- Toda tentativa grava `private.domain_proof_attempts` e um `audit_logs` `ownership_check` com
  `trigger` (`manual` ou `cron`) e resultado.

## Verificação diária (Cron)

- Executa dentro do Cron existente `17 * * * *`, como 4ª tarefa de `scheduled()`
  (`workers/api.mjs` l. 5856–5864), com `Promise.allSettled`.
- Fila: vínculos `active`, depois `awaiting_proof`/`ready_to_activate`, com `next_check_at <= now()`,
  pela RPC de serviço `external_links_due(max_rows)` (só `service_role`).
- Orçamento: para quando a execução gastar 30 subrequests (contador local), deixando folga no
  limite de 50 do Workers Free para as outras tarefas.
- Para cada vínculo `active`: comprovação (DNS e, se preciso, arquivo) e disponibilidade do destino
  (até 5 saltos, [redirect-behaviour.md](redirect-behaviour.md)). Grava o resultado por
  `external_link_record_check(site, result)` (só `service_role`), que numa transação:
  - posse negativa (`txt_*`/`file_*` em ambos os métodos) → `suspended` com
    `ownership_not_confirmed`, aviso `owner` e `operator`, auditoria;
  - laço → `suspended` com `loop_detected`, avisos, auditoria;
  - destino fora do ar → `consecutive_down_days + 1`; no 3º dia seguido, aviso `owner` e
    `operator` (sem suspender, FR-041);
  - `ok` → zera contadores; `next_check_at = now() + 24 h`.
- `awaiting_proof` com comprovação `ok` → `ready_to_activate` (aviso ao operador).
- Customização encerrada há mais de 7 dias → `disabled`, avisos e auditoria (edge case).
- O efeito na vitrine vale no próximo pedido depois do cache de 30 s do estado público; a spec pede
  até 5 minutos (SC-012).

## Sem SLA

O resolvedor público e o Cron gratuito podem falhar ou atrasar (Princípio IV). Erro temporário não
suspende; atraso do Cron só adia a verificação. Nada aqui promete prazo além do que a spec mede.
