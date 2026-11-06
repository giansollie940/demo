-- Rollback cho supabase/migrations/20261106090000_homework_due_not_past.sql. Một transaction.
-- Gỡ trigger và hai hàm mới; bỏ đúng dòng đã chèn vào validate_revision (phần còn lại không đổi).
begin;

drop trigger if exists homework_due_not_past on public.homework_notices;

do $unpatch$
declare
  def text := pg_get_functiondef('homework_private.validate_revision(public.homework_notices,jsonb)'::regprocedure);
  line constant text := $l$ perform homework_private.assert_due_not_past((p->>'due_at')::timestamptz, n.due_at); -- [due-not-past] hạn không ở quá khứ$l$;
  eol text;
begin
  if position(line in def) = 0 then return; end if;
  eol := case when position(line || chr(13) || chr(10) in def) > 0 then chr(13) || chr(10) else chr(10) end;
  execute replace(def, line || eol, '');
end
$unpatch$;

drop function if exists homework_private.due_not_past_guard();
drop function if exists homework_private.assert_due_not_past(timestamptz, timestamptz);

commit;
