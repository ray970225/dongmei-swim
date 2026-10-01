-- 此函式只由 auth.users 觸發器執行，不應暴露為可呼叫的 RPC。
revoke all on function public.create_member_profile() from public, anon, authenticated;
