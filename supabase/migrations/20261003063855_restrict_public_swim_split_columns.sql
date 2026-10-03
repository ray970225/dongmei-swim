-- Split charts need only the result link and split measurements.
revoke select on table public.splits from anon, authenticated;
grant select (id, result_id, distance_m, split_milliseconds)
  on table public.splits to anon, authenticated;
