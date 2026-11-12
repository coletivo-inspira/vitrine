-- Grant UPDATE on conflict key columns (site_id on public.publications, user_id on public.profiles)
-- required by PostgREST Prefer: resolution=merge-duplicates (INSERT ... ON CONFLICT DO UPDATE SET).
-- Append-only migration: never modify previous migrations.
begin;

grant update (site_id, slug, revision, status, artifact_hash, menu, published_at)
  on public.publications to authenticated;

grant update (user_id, display_name, business_name, city, whatsapp)
  on public.profiles to authenticated;

commit;
