-- 管理員建立或邀請的新帳號預設成一般會員並立即啟用。
-- Supabase「允許新使用者註冊」仍須保持關閉；此處不自動授予管理員權限。
-- 電子郵件驗證仍由 Supabase Auth 設定控管。
create or replace function public.create_member_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invited_name text;
  invited boolean := false;
begin
  if coalesce(new.email, '') <> '' then
    select i.display_name into invited_name from public.member_invites i
      where lower(i.email) = lower(new.email) for update;
    invited := found;
  end if;
  insert into public.profiles (id, email, display_name, role, active)
  values (new.id, coalesce(new.email, ''),
    case when invited then coalesce(invited_name, '') else '' end, 'member', true)
  on conflict (id) do nothing;
  if invited then
    delete from public.member_invites where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;
