-- 新會員可由管理台直接建立帳號，不經由邀請信。
-- 共用初始密碼僅供首次登入；改密碼前 RLS 不授予會員資料權限。
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

alter table public.member_invites
  add column if not exists must_change_password boolean not null default false;

create or replace function public.has_active_role(required_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.role = any(required_roles)
      and (p.role = 'admin' or not p.must_change_password)
  );
$$;
revoke all on function public.has_active_role(public.member_role[]) from public;
grant execute on function public.has_active_role(public.member_role[]) to anon, authenticated;

create or replace function public.create_member_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invited_name text;
  invited boolean := false;
  must_change boolean := false;
begin
  if coalesce(new.email, '') <> '' then
    select i.display_name, i.must_change_password
      into invited_name, must_change
      from public.member_invites i
      where lower(i.email) = lower(new.email)
      for update;
    invited := found;
  end if;
  insert into public.profiles (id, email, display_name, role, active, must_change_password)
  values (new.id, coalesce(new.email, ''),
    case when invited then coalesce(invited_name, '') else '' end,
    'member', invited, case when invited then must_change else false end)
  on conflict (id) do nothing;
  if invited then
    delete from public.member_invites where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;
revoke all on function public.create_member_profile() from public, anon, authenticated;
