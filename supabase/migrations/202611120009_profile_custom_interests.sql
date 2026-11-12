-- Allow custom user-entered profile interests prefixed with 'outro:' (2 to 40 chars, no HTML angle brackets)
-- alongside the 8 standard preset interest keys.
begin;

alter table public.profile_interests
  drop constraint if exists profile_interests_interest_check;

alter table public.profile_interests
  add constraint profile_interests_interest_check check (
    interest in (
      'cardapio-digital',
      'agendamento',
      'orcamento-whatsapp',
      'dominio-proprio',
      'identidade-visual',
      'fotografia-conteudo',
      'automacao-atendimento',
      'design-sob-medida'
    )
    or (
      interest like 'outro:%'
      and char_length(btrim(substring(interest from 7))) between 2 and 40
      and interest !~ '[<>]'
    )
  );

commit;
