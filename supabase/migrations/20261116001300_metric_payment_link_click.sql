-- Link de pagamento do próprio negócio (issue #134): a métrica agregada
-- payment_link_click conta os cliques no link de pagamento do item. Só contagem por
-- dia, hora e origem; o link não ganha parâmetros e nenhum dado do visitante é gravado.
-- Espelho de ALLOWED_METRIC_EVENT_TYPES em src/portal-validation.mjs; mantém
-- notify_click (20261116001200). A métrica é da vitrine (sem item), então
-- private.site_item_metric_names() não muda.
-- Append-only: migrações anteriores não são alteradas.
begin;

create or replace function private.site_metric_names()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    'visit', 'item_view', 'item_select', 'whatsapp_order', 'route_click', 'qr_visit',
    'notify_click', 'payment_link_click'
  ]::text[];
$$;

revoke all on function private.site_metric_names() from public;

commit;
