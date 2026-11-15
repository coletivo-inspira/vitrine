-- Migração 20261116001800_template_servicos_produtos.sql
-- Modelo "Serviços e produtos" (issue #136): vertical `services`, páginas opcionais por
-- modelo (`default_pages`, com "Para empresas" desligada) e a lista de módulos com o
-- `highlights` e os campos novos de `hero`, `testimonials` e `faq` (issues #131 e #132).
-- A receita é espelhada em src/servicos-produtos-template.mjs; o teste
-- test/servicos-produtos-template.test.mjs confere que os dois são iguais.
-- Migração append-only: nunca modifique migrações anteriores.
begin;

-- 1. Vertical `services` e páginas extras herdadas do modelo.
alter table public.templates
  drop constraint if exists templates_storefront_type_check;

alter table public.templates
  add constraint templates_storefront_type_check check (
    storefront_type in ('food', 'art', 'photo', 'health', 'tech', 'services')
  );

alter table public.templates
  add column if not exists default_pages jsonb not null default '[]'::jsonb
  constraint templates_default_pages_check check (jsonb_typeof(default_pages) = 'array');

-- 2. Vitrines podem nascer com o modelo novo.
alter table public.sites
  drop constraint if exists sites_template_check;

alter table public.sites
  add constraint sites_template_check check (
    template in ('pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1', 'servicos-produtos-v1')
  );

-- 3. Modelo: cabeçalho → hero pessoal → destaques → itens → sobre → depoimentos →
-- perguntas frequentes → chamada final → rodapé. Textos iniciais neutros, com a
-- indicação do que escrever; depoimentos vazios (publicar exige consentimento).
insert into public.templates (
  code, name, storefront_type, catalog_type, schema_version,
  default_tokens, default_sections, default_pages, is_custom_only, active
)
values (
  'servicos-produtos-v1',
  'Serviços e produtos',
  'services',
  'products',
  1,
  '{"accentColor":"#9C4221","fontPair":"editorial-syne","buttonStyle":"rounded"}'::jsonb,
  '[
    {"id":"sec-abertura","moduleCode":"hero","config":{
      "eyebrow":"Sua profissão ou especialidade",
      "headline":"Conte em uma frase para quem é o seu trabalho",
      "subtitle":"Explique em uma ou duas linhas o que a pessoa encontra aqui e como você atende.",
      "primaryAction":{"label":"Ver serviços e produtos","target":"selecao"},
      "secondaryAction":{"label":"Conversar no WhatsApp","target":"whatsapp"}}},
    {"id":"sec-destaques","moduleCode":"highlights","config":{"items":[
      {"icon":"online","text":"Diga como atende: online, presencial ou os dois"},
      {"icon":"pessoas","text":"Conte para quem é: individual, grupo ou turma"},
      {"icon":"garantia","text":"Escreva uma condição que dá segurança"},
      {"icon":"mensagem","text":"Atendimento direto pelo WhatsApp"}]}},
    {"id":"sec-itens","moduleCode":"catalog_grid","config":{"columns":2}},
    {"id":"sec-sobre","moduleCode":"about_story","config":{
      "bio":"Conte sua história: há quanto tempo faz este trabalho, como começou e o que a pessoa encontra ao falar com você."}},
    {"id":"sec-depoimentos","moduleCode":"testimonials","config":{"items":[]}},
    {"id":"sec-perguntas","moduleCode":"faq","config":{"items":[
      {"q":"Quais são as formas de pagamento?","a":"Escreva como a pessoa paga: Pix, cartão, na hora do atendimento ou pelo link do seu sistema de pagamento."},
      {"q":"É online ou presencial?","a":"Explique onde o atendimento acontece e o que a pessoa precisa ter ou levar."},
      {"q":"E se eu precisar remarcar?","a":"Diga com quanto tempo de antecedência dá para remarcar e como avisar."}]}},
    {"id":"sec-chamada-final","moduleCode":"hero","config":{
      "headline":"Escreva aqui o convite final, como “Vamos conversar sobre o que você precisa?”",
      "subtitle":"Uma linha que lembre como é simples falar com você.",
      "primaryAction":{"label":"Conversar no WhatsApp","target":"whatsapp"}}}
  ]'::jsonb,
  '[
    {"slug":"empresas","title":"Para empresas","active":false,"sections":[
      {"id":"sec-empresas-abertura","moduleCode":"hero","config":{
        "headline":"Diga o que você oferece para empresas",
        "subtitle":"Palestras, oficinas, encomendas em quantidade ou parcerias: conte em uma frase como trabalha com equipes e marcas."}},
      {"id":"sec-empresas-orcamento","moduleCode":"quote_request","config":{"allowNotes":true}},
      {"id":"sec-empresas-perguntas","moduleCode":"faq","config":{"title":"Perguntas de empresas","items":[
        {"q":"Você emite nota fiscal?","a":"Responda se emite nota e quais dados precisa receber da empresa."},
        {"q":"Em quanto tempo chega o orçamento?","a":"Diga em quanto tempo responde e o que a empresa precisa contar no pedido."}]}}
    ]}
  ]'::jsonb,
  false,
  true
)
on conflict (code) do nothing;

-- 4. Lista de módulos: o formato de `config_schema` espelha os campos aceitos por
-- src/showcase-structure.mjs (listas descrevem o formato de cada item).
insert into public.modules (code, name, category, config_schema, default_config, active)
values (
  'highlights', 'Destaques', 'presentation',
  '{"items":[{"icon":"string","text":"string"}]}'::jsonb,
  '{"items":[]}'::jsonb,
  true
)
on conflict (code) do nothing;

update public.modules
set config_schema = '{
  "headline":"string","subtitle":"string","eyebrow":"string",
  "imageUrl":"string","imageAlt":"string",
  "primaryAction":{"label":"string","target":"string"},
  "secondaryAction":{"label":"string","target":"string"}
}'::jsonb
where code = 'hero';

update public.modules
set config_schema = '{"items":[{"name":"string","quote":"string","context":"string","photoUrl":"string","consent":"boolean"}]}'::jsonb
where code = 'testimonials';

update public.modules
set config_schema = '{"title":"string","items":[{"q":"string","a":"string"}]}'::jsonb
where code = 'faq';

commit;
