-- "Xếp cặp theo đề" high scores for signed-in learners, shown in personal settings.
--
-- Deliberately separate from auth_bag: nothing here reads or writes the bag credentials or the
-- login attempt counters, so a bug or spam in the game can never affect signing in.
--
-- · One row per learner, per rules season, per school year: the best score only, so the data
--   does not grow with the number of games played.
-- · "Năm nay" = the active school year, the caller's own class. "Mọi thời đại" = best across
--   years within the current season, whole school. A new season starts when the rules change.
-- · Only learners who opt in appear on a board; everyone always sees their own best.
-- · A learner who has left (inactive or soft-deleted) stays on the all-time board as an
--   abbreviated name with the class and year of that best score. A hard-deleted profile takes
--   its rows with it (on delete cascade).
-- · Scores are submitted against a one-use ticket from `start`; the server rejects a score that
--   could not have been reached in the time since the ticket was issued.
begin;

create schema if not exists bag_game;
revoke all on schema bag_game from public, anon, authenticated;

create table bag_game.config (
  id boolean primary key default true check (id),
  season int not null default 1 check (season > 0)
);
insert into bag_game.config (id, season) values (true, 1);

create table bag_game.tickets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  season int not null,
  started_at timestamptz not null default clock_timestamp()
);
create index bag_game_tickets_profile on bag_game.tickets (profile_id, started_at desc);

create table bag_game.scores (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  season int not null,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  -- Snapshot of the class at the time: classes belong to one school year, and a learner who has
  -- left must still show where the score was made.
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null default '',
  score int not null check (score > 0),
  achieved_at timestamptz not null default clock_timestamp(),
  primary key (profile_id, season, school_year_id)
);
create index bag_game_scores_board on bag_game.scores (season, school_year_id, score desc);

create table bag_game.prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  show_on_board boolean not null default false
);

revoke all on all tables in schema bag_game from public, anon, authenticated;

-- "Nguyễn Văn An" → "N.V.An". Used only for learners who have left.
create function bag_game.short_name(p_full text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare
  w text[] := array_remove(regexp_split_to_array(btrim(coalesce(p_full, '')), '\s+'), '');
  n int := coalesce(array_length(w, 1), 0);
  out text := '';
begin
  if n = 0 then return 'Học sinh'; end if;
  for i in 1 .. n - 1 loop out := out || left(w[i], 1) || '.'; end loop;
  return out || w[n];
end;
$$;
revoke all on function bag_game.short_name(text) from public, anon, authenticated;

-- Tuning. A round needs at least 3 items put in, so 2 s per round is already generous.
create function bag_game.min_seconds_per_round() returns int language sql immutable as $$ select 2 $$;
revoke all on function bag_game.min_seconds_per_round() from public, anon, authenticated;

create or replace function public.bag_game(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me public.profiles;
  v_season int;
  v_year public.school_years;
  v_ticket bag_game.tickets;
  v_score int;
  v_class_name text;
  v_board jsonb;
  v_scope text;
  v_want_season int;
  v_rejected boolean := false;
begin
  select * into me from public.profiles
   where id = auth.uid() and active and deleted_at is null and role::text in ('student', 'monitor');
  if me.id is null then
    raise exception 'Chỉ học sinh đang học mới chơi được.' using errcode = '42501';
  end if;
  select season into v_season from bag_game.config;
  select * into v_year from public.school_years where is_active order by start_date desc nulls last limit 1;

  if p_action = 'start' then
    if coalesce((p_data->>'rules')::int, 0) <> v_season then
      raise exception 'Trò chơi vừa được cập nhật. Hãy tải lại trang.' using errcode = '22023';
    end if;
    delete from bag_game.tickets where started_at < clock_timestamp() - interval '1 day';
    if (select count(*) from bag_game.tickets
         where profile_id = me.id and started_at > clock_timestamp() - interval '1 hour') >= 60 then
      raise exception 'Bạn chơi nhiều quá rồi, nghỉ một chút nhé!' using errcode = '53400';
    end if;
    insert into bag_game.tickets (profile_id, season) values (me.id, v_season) returning * into v_ticket;
    return jsonb_build_object('ticket', v_ticket.id);

  elsif p_action = 'submit' then
    v_score := (p_data->>'score')::int;
    if v_score is null or v_score < 0 or v_score > 1000 then
      raise exception 'Điểm không hợp lệ.' using errcode = '22023';
    end if;
    -- One use: the ticket is consumed whatever happens next. A rejection is answered, not raised,
    -- so this delete commits and the same ticket cannot be retried with another score.
    delete from bag_game.tickets
     where id = (p_data->>'ticket')::uuid and profile_id = me.id
     returning * into v_ticket;
    v_rejected := v_ticket.id is null or v_ticket.season <> v_season
       or v_ticket.started_at < clock_timestamp() - interval '3 hours'
       or v_score * bag_game.min_seconds_per_round() > extract(epoch from clock_timestamp() - v_ticket.started_at);
    if not v_rejected and v_score > 0 and v_year.id is not null and v_year.archive_state = 'active' then
      select coalesce(nullif(c.code, ''), c.name, me.class_name, '') into v_class_name
        from (select 1) one left join public.classes c on c.id = me.class_id;
      insert into bag_game.scores as s (profile_id, season, school_year_id, class_id, class_name, score)
      values (me.id, v_season, v_year.id, me.class_id, coalesce(v_class_name, ''), v_score)
      on conflict (profile_id, season, school_year_id) do update
        set score = excluded.score, class_id = excluded.class_id, class_name = excluded.class_name,
            achieved_at = excluded.achieved_at
        where excluded.score > s.score;
    end if;
    p_action := 'board'; -- fall through: answer with the fresh boards

  elsif p_action = 'set_visibility' then
    insert into bag_game.prefs (profile_id, show_on_board) values (me.id, coalesce((p_data->>'show')::boolean, false))
    on conflict (profile_id) do update set show_on_board = excluded.show_on_board;
    p_action := 'board';
  end if;

  if p_action <> 'board' then
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  v_scope := coalesce(p_data->>'scope', 'year');
  v_want_season := coalesce((p_data->>'season')::int, v_season);

  if v_scope = 'year' then
    select coalesce(jsonb_agg(r order by (r->>'score')::int desc, r->>'at'), '[]'::jsonb) into v_board from (
      select jsonb_build_object('name', p.full_name, 'class', s.class_name, 'score', s.score,
                                'at', s.achieved_at, 'me', p.id = me.id) r
        from bag_game.scores s
        join public.profiles p on p.id = s.profile_id
        join bag_game.prefs f on f.profile_id = s.profile_id and f.show_on_board
       where s.season = v_season and s.school_year_id = v_year.id
         and me.class_id is not null and s.class_id = me.class_id
         and p.active and p.deleted_at is null
       order by s.score desc, s.achieved_at
       limit 10) q;
  elsif v_scope = 'all' then
    select coalesce(jsonb_agg(r order by (r->>'score')::int desc, r->>'at'), '[]'::jsonb) into v_board from (
      select jsonb_build_object(
               'name', case when current_learner then p.full_name else bag_game.short_name(p.full_name) end,
               'class', case when current_learner then coalesce(nullif(c.code, ''), c.name, p.class_name, b.class_name) else b.class_name end,
               'year', case when current_learner then null else y.name end,
               'left', not current_learner,
               'score', b.score, 'at', b.achieved_at, 'me', p.id = me.id) r
        from (select distinct on (s.profile_id) s.*
                from bag_game.scores s
               where s.season = v_want_season
               order by s.profile_id, s.score desc, s.achieved_at) b
        join public.profiles p on p.id = b.profile_id
        join bag_game.prefs f on f.profile_id = b.profile_id and f.show_on_board
        join public.school_years y on y.id = b.school_year_id
        left join public.classes c on c.id = p.class_id
        cross join lateral (select p.active and p.deleted_at is null as current_learner) cl
       order by b.score desc, b.achieved_at
       limit 10) q;
  else
    raise exception 'Unknown scope' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'board', v_board,
    'rejected', v_rejected,
    'scope', v_scope,
    'season', v_want_season,
    'current_season', v_season,
    'seasons', (select coalesce(jsonb_agg(distinct season order by season), '[]'::jsonb) from bag_game.scores),
    'year_name', v_year.name,
    'my_year_best', (select score from bag_game.scores
                      where profile_id = me.id and season = v_season and school_year_id = v_year.id),
    'my_all_best', (select max(score) from bag_game.scores where profile_id = me.id and season = v_season),
    'show_on_board', coalesce((select show_on_board from bag_game.prefs where profile_id = me.id), false)
  );
end;
$$;

revoke all on function public.bag_game(text, jsonb) from public, anon;
grant execute on function public.bag_game(text, jsonb) to authenticated;

commit;
