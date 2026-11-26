# Custos e limites da AutoResposta

Estimativa de 2026-11-26. Planos gratuitos não são SLA nem custo zero permanente (Princípio IV). Nenhum serviço pago é contratado.

## Premissas

| Premissa | Valor |
| --- | --- |
| Mensagens recebidas por vitrine/dia | 20 (negócio pequeno; picos de 200) |
| Respostas do dono por vitrine/dia (geram eco no webhook `messages`) | 15 |
| Contatos únicos por vitrine/dia | 8 |
| Frequência | 24 h |
| Webhooks por vitrine/dia | 20 recebidas + 15 ecos do dono + 8 ecos da Vitrine ≈ 43 requisições |
| Respostas enviadas por vitrine/dia | ≈ 8 (uma por contato único) |
| Linha de execução | ≈ 400 bytes com índices (só eventos elegíveis: 20/dia) |
| Retenção | 90 dias |

Eventos recebidos ≠ mensagens enviadas: ecos e leituras não geram linha nem envio; a frequência corta repetições.

## Simulação

| Vitrines | Requisições ao Worker/dia | Respostas enviadas/dia | Linhas em 90 dias | Banco aproximado | Observação |
| --- | --- | --- | --- | --- | --- |
| 10 | ≈ 430 | ≈ 80 | 18 mil | ≈ 7 MB | Folgado |
| 100 | ≈ 4,3 mil | ≈ 800 | 180 mil | ≈ 72 MB | Folgado; monitorar |
| 1.000 | ≈ 43 mil | ≈ 8 mil | 1,8 milhão | ≈ 720 MB | **Passa** dos 500 MB do Supabase Free e usa ~43% das 100 mil requisições/dia do Workers Free, que também servem as vitrines |

Subrequisições por evento elegível: ≈ 6 (contexto, reclamação, vaga, releitura, envio, final), dentro de 50 por invocação com o teto de 5 eventos novos. CPU: HMAC e JSON pequenos, abaixo de 10 ms por requisição na medição local dos testes (não medido no Workers).

Cron: 1 chamada ao banco + até 5 `debug_token` + 5 escritas por hora; 1.000 conexões são verificadas a cada ≈ 8 dias.

Meta: a API de mensagens do Instagram não cobra por mensagem. Limites: 100 envios de texto/s por conta (folgado).

## Proteções contra crescimento de custo

- Interruptor global e por canal; liberação por vitrine.
- Só eventos elegíveis viram linha; ecos e leituras só entram na contagem do log.
- Teto de 5 eventos novos por requisição.
- Retenção de 90 dias e limpeza de janelas vencidas.
- A partir de ~300 vitrines ativas: reduzir a retenção para 30 dias ou trocar linhas por contadores diários antes de chegar ao limite do banco (decisão futura; nada pago).

## WhatsApp (referência)

O WhatsApp Cloud API cobra por mensagem fora da janela de atendimento (modelos) e tem regras próprias de custo por país. Ver [`whatsapp-discovery.md`](whatsapp-discovery.md).
