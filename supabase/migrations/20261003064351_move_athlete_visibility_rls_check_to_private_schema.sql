-- Keep the cross-table RLS check out of browser-role SELECT permissions.
-- The SECURITY DEFINER helper lives in a non-API schema and returns only a
-- boolean; its search_path is fixed to prevent object-shadowing attacks.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_view_athlete(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and a.active
      and (
        a.visibility = 'public'::public.visibility_level
        or (
          a.visibility = 'member'::public.visibility_level
          and public.has_active_role(array['member','admin']::public.member_role[])
        )
        or (
          a.visibility = 'admin'::public.visibility_level
          and public.has_active_role(array['admin']::public.member_role[])
        )
      )
  );
$function$;

revoke all on function private.can_view_athlete(uuid) from public, anon, authenticated;
grant execute on function private.can_view_athlete(uuid) to anon, authenticated;

drop policy if exists results_by_visibility on public.results;
create policy results_by_visibility on public.results
for select to anon, authenticated
using (
  (
    visibility = 'public'::public.visibility_level
    or (
      visibility = 'member'::public.visibility_level
      and public.has_active_role(array['member','admin']::public.member_role[])
    )
    or (
      visibility = 'admin'::public.visibility_level
      and public.has_active_role(array['admin']::public.member_role[])
    )
  )
  and private.can_view_athlete(athlete_id)
);
