-- AUTH-BAG-001 — "Mật mã chiếc cặp": optional second sign-in method for students and monitors.
--
-- The school-bag sequence is a SECOND, independent credential. The Supabase password is never
-- read, changed or derived from it. What is stored is a salted one-way bcrypt verifier of the
-- canonical verifier input [catalog version, code...] (at most 21 bytes, so bcrypt's 72-byte
-- limit never truncates it). Validated end to end on a throwaway project (GATE-AUTH spike, 26/26).
--
-- Tables live in the private schema auth_bag (not exposed through the Data API). The Edge
-- Functions bag-enroll and bag-login reach them only through the public.bag_auth_* functions
-- below, which are SECURITY DEFINER and executable by service_role alone.
begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth_bag;
revoke all on schema auth_bag from public, anon, authenticated;

create table if not exists auth_bag.credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  catalog_version smallint not null,
  verifier text not null,
  credential_version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Failure counters keyed by scope ('account:<uuid>', 'account:code:<code>', 'ip:<addr>').
create table if not exists auth_bag.attempts (
  scope text primary key,
  window_start timestamptz not null default now(),
  failures integer not null default 0,
  locked_until timestamptz
);

-- Event type and outcome only: never items, length, prefix, IP or tokens.
create table if not exists auth_bag.audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  event text not null check (event in ('enroll', 'disable', 'login')),
  user_id uuid references auth.users(id) on delete set null,
  reason text not null
);
create index if not exists auth_bag_audit_user_at on auth_bag.audit (user_id, at desc);

alter table auth_bag.credentials enable row level security;
alter table auth_bag.attempts enable row level security;
alter table auth_bag.audit enable row level security;
revoke all on all tables in schema auth_bag from public, anon, authenticated;

-- ===== Internal helpers (not callable by API roles) =====

-- [version][code * 10..20], every code inside the catalogue.
create or replace function auth_bag.valid_input(p_input bytea, p_catalog smallint, p_catalog_size int)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_input) between 11 and 21
     and get_byte(p_input, 0) = p_catalog
     and not exists (
       select 1 from generate_series(1, length(p_input) - 1) i where get_byte(p_input, i) >= p_catalog_size
     )
$$;

-- Hex text in, bytea out; null for anything that is not clean hex.
create or replace function auth_bag.decode_input(p_hex text)
returns bytea language sql immutable set search_path = '' as $$
  select case when p_hex ~ '^([0-9a-f]{2}){1,32}$' then decode(p_hex, 'hex') end
$$;

create or replace function auth_bag.eligible(p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = p_user and active and deleted_at is null and role::text in ('student', 'monitor')
  )
$$;

create or replace function auth_bag.is_locked(p_scope text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from auth_bag.attempts where scope = p_scope and locked_until > now())
$$;

-- Atomically counts a failure inside a window; locks the scope once it reaches p_max.
create or replace function auth_bag.record_failure(p_scope text, p_max int, p_window_seconds int, p_lock_seconds int)
returns void language plpgsql set search_path = '' as $$
begin
  insert into auth_bag.attempts as a (scope, window_start, failures)
  values (p_scope, now(), 1)
  on conflict (scope) do update
    set failures = case when a.window_start < now() - make_interval(secs => p_window_seconds) then 1 else a.failures + 1 end,
        window_start = case when a.window_start < now() - make_interval(secs => p_window_seconds) then now() else a.window_start end;
  update auth_bag.attempts
     set locked_until = now() + make_interval(secs => p_lock_seconds), failures = 0, window_start = now()
   where scope = p_scope and failures >= p_max;
end $$;

revoke all on function auth_bag.valid_input(bytea, smallint, int) from public, anon, authenticated;
revoke all on function auth_bag.decode_input(text) from public, anon, authenticated;
revoke all on function auth_bag.eligible(uuid) from public, anon, authenticated;
revoke all on function auth_bag.is_locked(text) from public, anon, authenticated;
revoke all on function auth_bag.record_failure(text, int, int, int) from public, anon, authenticated;

-- ===== Service-role API =====

create or replace function public.bag_auth_status(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', coalesce(bool_or(enabled), false), 'updated_at', max(updated_at))
    from auth_bag.credentials where user_id = p_user
$$;

-- Creates or replaces the verifier; every change bumps credential_version so a login that
-- matched the old one cannot finish (EC-005). Returns the new credential_version.
create or replace function public.bag_auth_enroll(p_user uuid, p_input_hex text, p_catalog smallint, p_catalog_size int)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_input bytea := auth_bag.decode_input(p_input_hex);
  v_version integer;
begin
  if v_input is null or not auth_bag.valid_input(v_input, p_catalog, p_catalog_size) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not auth_bag.eligible(p_user) then
    raise exception 'not_eligible' using errcode = '42501';
  end if;
  insert into auth_bag.credentials as c (user_id, catalog_version, verifier)
  values (p_user, p_catalog, extensions.crypt(encode(v_input, 'hex'), extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update
    set catalog_version = excluded.catalog_version,
        verifier = excluded.verifier,
        credential_version = c.credential_version + 1,
        enabled = true,
        updated_at = now()
  returning credential_version into v_version;
  insert into auth_bag.audit (event, user_id, reason) values ('enroll', p_user, 'ok');
  return v_version;
end $$;

create or replace function public.bag_auth_disable(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update auth_bag.credentials
     set enabled = false, credential_version = credential_version + 1, updated_at = now()
   where user_id = p_user;
  insert into auth_bag.audit (event, user_id, reason) values ('disable', p_user, 'ok');
end $$;

-- One sign-in attempt, decided in one transaction:
--   locks (IP, then account) → bcrypt verify → eligibility → failure counting / reset → audit.
-- Returns {ok:true, user_id, credential_version} or {ok:false}. Every refusal looks the same to
-- the caller; unknown accounts pay for one bcrypt round too, and locks key on the login code
-- for them, so neither timing nor lock behaviour reveals which accounts exist or are enrolled.
create or replace function public.bag_auth_attempt(
  p_email text, p_code text, p_input_hex text, p_ip text,
  p_catalog smallint, p_catalog_size int,
  p_account_max int, p_account_window int, p_account_lock int,
  p_ip_max int, p_ip_window int, p_ip_lock int
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ip_scope text := 'ip:' || coalesce(nullif(p_ip, ''), 'unknown');
  v_user uuid;
  v_scope text;
  v_input bytea := auth_bag.decode_input(p_input_hex);
  v_row record;
  v_match boolean := false;
  v_reason text;
begin
  if auth_bag.is_locked(v_ip_scope) then
    return jsonb_build_object('ok', false);
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email) and deleted_at is null limit 1;
  v_scope := 'account:' || coalesce(v_user::text, 'code:' || lower(coalesce(p_code, '')));
  if auth_bag.is_locked(v_scope) then
    return jsonb_build_object('ok', false);
  end if;

  select verifier, credential_version into v_row
    from auth_bag.credentials where user_id = v_user and enabled and catalog_version = p_catalog;

  if v_row.verifier is not null and v_input is not null and auth_bag.valid_input(v_input, p_catalog, p_catalog_size) then
    v_match := extensions.crypt(encode(v_input, 'hex'), v_row.verifier) = v_row.verifier;
  else
    -- Same cost as a real check.
    perform extensions.crypt(coalesce(p_input_hex, ''), '$2a$10$abcdefghijklmnopqrstuu5XdWm0nD6i1DxNGUwwvQw2n8cq2O0Wm');
  end if;

  v_reason := case
    when v_user is null or not v_match then 'mismatch'
    when not auth_bag.eligible(v_user) then 'ineligible'
  end;

  if v_reason is not null then
    perform auth_bag.record_failure(v_scope, p_account_max, p_account_window, p_account_lock);
    perform auth_bag.record_failure(v_ip_scope, p_ip_max, p_ip_window, p_ip_lock);
    insert into auth_bag.audit (event, user_id, reason) values ('login', v_user, v_reason);
    return jsonb_build_object('ok', false);
  end if;

  delete from auth_bag.attempts where scope = v_scope;
  insert into auth_bag.audit (event, user_id, reason) values ('login', v_user, 'ok');
  return jsonb_build_object('ok', true, 'user_id', v_user, 'credential_version', v_row.credential_version);
end $$;

-- Final re-check right before the session is issued: a change or disable racing the login wins.
create or replace function public.bag_auth_still_valid(p_user uuid, p_version integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth_bag.credentials where user_id = p_user and enabled and credential_version = p_version)
     and auth_bag.eligible(p_user)
$$;

revoke all on function public.bag_auth_status(uuid) from public, anon, authenticated;
revoke all on function public.bag_auth_enroll(uuid, text, smallint, int) from public, anon, authenticated;
revoke all on function public.bag_auth_disable(uuid) from public, anon, authenticated;
revoke all on function public.bag_auth_attempt(text, text, text, text, smallint, int, int, int, int, int, int, int) from public, anon, authenticated;
revoke all on function public.bag_auth_still_valid(uuid, integer) from public, anon, authenticated;
grant execute on function public.bag_auth_status(uuid) to service_role;
grant execute on function public.bag_auth_enroll(uuid, text, smallint, int) to service_role;
grant execute on function public.bag_auth_disable(uuid) to service_role;
grant execute on function public.bag_auth_attempt(text, text, text, text, smallint, int, int, int, int, int, int, int) to service_role;
grant execute on function public.bag_auth_still_valid(uuid, integer) to service_role;

commit;
