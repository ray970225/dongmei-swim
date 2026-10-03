-- Public result lookup only needs names, source IDs, and performance fields.
-- Keep demographic and crawler provenance columns private to trusted backend
-- operations; do not grant broad table-level SELECT to browser roles.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

revoke select on table public.athletes, public.results from anon, authenticated;
grant select (id, source_swimmer_id, full_name, active)
  on table public.athletes to anon, authenticated;
grant select (
  id, athlete_id, meet_id, event_name, competition_date, team_name, rank,
  time_text, time_milliseconds, pool_type, round_name, age_group
)
  on table public.results to anon, authenticated;
