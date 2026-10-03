-- Avoid cross-table reads in client-role RLS policies after restricting
-- browser SELECT to an explicit allowlist of public result columns.
create or replace function private.can_view_result(p_result_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.results r
    where r.id = p_result_id
      and (
        r.visibility = 'public'::public.visibility_level
        or (
          r.visibility = 'member'::public.visibility_level
          and public.has_active_role(array['member','admin']::public.member_role[])
        )
        or (
          r.visibility = 'admin'::public.visibility_level
          and public.has_active_role(array['admin']::public.member_role[])
        )
      )
      and private.can_view_athlete(r.athlete_id)
  );
$function$;

create or replace function private.can_view_meet(p_meet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.results r
    where r.meet_id = p_meet_id
      and (
        r.visibility = 'public'::public.visibility_level
        or (
          r.visibility = 'member'::public.visibility_level
          and public.has_active_role(array['member','admin']::public.member_role[])
        )
        or (
          r.visibility = 'admin'::public.visibility_level
          and public.has_active_role(array['admin']::public.member_role[])
        )
      )
      and private.can_view_athlete(r.athlete_id)
  );
$function$;

revoke all on function private.can_view_result(text) from public, anon, authenticated;
revoke all on function private.can_view_meet(uuid) from public, anon, authenticated;
grant execute on function private.can_view_result(text), private.can_view_meet(uuid) to anon, authenticated;

drop policy if exists meets_visible_results on public.meets;
create policy meets_visible_results on public.meets
for select to anon, authenticated
using (private.can_view_meet(id));

drop policy if exists splits_visible_result on public.splits;
create policy splits_visible_result on public.splits
for select to anon, authenticated
using (private.can_view_result(result_id));
