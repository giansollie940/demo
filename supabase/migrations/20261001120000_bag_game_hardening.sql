-- bag_game: hardening flagged by the Supabase advisors.
--
-- · function_search_path_mutable: pin search_path on the one helper that had none. It only
--   returns a constant, but a fixed search_path keeps it safe if it ever grows.
-- · unindexed_foreign_keys: bag_game.scores references school_years and classes; deleting a
--   year or class (on delete cascade / set null) would otherwise scan the whole table.
alter function bag_game.min_seconds_per_round() set search_path = pg_catalog;

create index if not exists bag_game_scores_school_year on bag_game.scores (school_year_id);
create index if not exists bag_game_scores_class on bag_game.scores (class_id);
