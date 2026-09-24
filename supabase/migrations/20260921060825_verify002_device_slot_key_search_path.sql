create or replace function public.device_use_slot_key(
    p_class_id uuid,
    p_weekday integer,
    p_period_number integer
  )
  returns bigint
  language sql
  immutable
  set search_path = pg_catalog, public
  as $$
    select pg_catalog.hashtextextended(
      p_class_id::text || ':' || p_weekday::text || ':' || p_period_number::text,
      0
    )
  $$;

  revoke all on function public.device_use_slot_key(uuid, integer, integer)
    from public, anon, authenticated;
