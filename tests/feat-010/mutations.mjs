/**
 * Mutations of `13-FEAT-010-DEVICE-USE-LOCK.sql`.
 *
 * A test suite that passes is not evidence; a test suite that fails when the
 * thing it guards is broken is. Each entry below breaks exactly one rule. The
 * runner (`scripts/mutate-feat010.mjs`) applies one at a time and re-runs the
 * whole suite. **A mutation with zero failing tests means the test is defective,
 * not that the mutation is harmless** — that is the bar this project holds, and
 * every zero has to be explained in the report or fixed.
 *
 * Each mutation asserts that its own `find` string actually occurred, so a
 * mutation cannot silently become a no-op when the migration is edited.
 */

/**
 * `expected` is the number of places the snippet must occur — default one.
 *
 * Checking only that the snippet is *present* is not enough, and this file has
 * already been bitten by it: a `find` indented six spaces also matches inside a
 * line indented seven, so when RC2 added a second call site three mutations
 * silently moved there and stopped testing the rule in their own name. They
 * still reported "applied". Counting makes that a loud failure.
 */
const replace = (find, put, expected = 1) => text => {
  const count = text.split(find).length - 1;
  if (count !== expected) {
    throw new Error(`mutation phải khớp ${expected} chỗ nhưng khớp ${count}:\n${find}`);
  }
  return text.split(find).join(put);
};

export const mutations = {
  M1: {
    what: 'trigger không bao giờ hạ quyền: hiệu lực luôn bằng yêu cầu',
    apply: replace(
      `  new.effective_uses_electronic_device := public.device_use_effective(
    new.uses_electronic_device, new.class_id, new.week_id, new.weekday, new.period_number);`,
      '  new.effective_uses_electronic_device := coalesce(new.uses_electronic_device,false);'),
  },
  M2: {
    what: 'BR-010-005: khoá hồi tố cả buổi bắt đầu đúng lúc bấm Lock (> thành >=)',
    apply: replace('     and p_session_start > i.locked_at', '     and p_session_start >= i.locked_at'),
  },
  M3: {
    what: 'BR-010-005: mở khoá hồi tố buổi bắt đầu đúng lúc bấm Unlock (<= thành <)',
    apply: replace('     and (i.unlocked_at is null or p_session_start <= i.unlocked_at)',
                   '     and (i.unlocked_at is null or p_session_start < i.unlocked_at)'),
  },
  M4: {
    what: 'DEC-104: quên hẳn unlocked_at — đã khoá là khoá mãi mãi',
    apply: replace('     and (i.unlocked_at is null or p_session_start <= i.unlocked_at)', ''),
  },
  M5: {
    what: 'Lock không tính lại các đăng ký đã có',
    apply: replace(`    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_lock'`,
      `    v_moved := 0;
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_lock'`),
  },
  M6: {
    what: 'Unlock không tính lại các đăng ký đã có',
    apply: replace(`    v_moved := public.device_use_recompute(v_class,v_wd,v_pn);
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_unlock'`,
      `    v_moved := 0;
    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_unlock'`),
  },
  M7: {
    // Vị từ này chuyển vào `device_use_live_override()` ở RC8 (Sol RC7 R-008),
    // nên `find` đổi theo; điều nó phá thì không đổi.
    what: 'DEC-113: override đã hủy vẫn có hiệu lực',
    apply: replace('     and (o.revoked_at is null or p_session_start <= o.revoked_at)', ''),
  },
  M8: {
    what: 'override hồi tố: mở cả những buổi đã bắt đầu trước khi nó được tạo',
    apply: replace('     and p_session_start > o.created_at', ''),
  },
  M9: {
    what: 'DEC-109: Admin được thay giáo viên khoá/mở (teacher_has_class → can_manage_class)',
    apply: replace(`    if not public.teacher_has_class(v_class) then
      raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
    end if;`,
      `    if not public.can_manage_class(v_class) then
      raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
    end if;`),
  },
  M10: {
    what: 'bỏ coalesce ở kiểm tra quyền đọc — NULL trở thành "được phép"',
    apply: replace(
      '    if not coalesce(v_manager or v_class = public.current_student_class_id(), false) then',
      '    if not (v_manager or v_class = public.current_student_class_id()) then'),
  },
  M11: {
    what: '§13: mở cho authenticated ghi thẳng vào bảng policy',
    apply: replace(
      'grant select on public.device_use_lock_intervals, public.device_use_session_overrides to authenticated;',
      `grant select, insert, update, delete on public.device_use_lock_intervals, public.device_use_session_overrides to authenticated;
create policy device_use_lock_intervals_write_mut on public.device_use_lock_intervals for all to authenticated using (true) with check (true);`),
  },
  M12: {
    what: 'BR-010-018: bỏ khoá tư vấn ở đường ghi đăng ký',
    apply: replace(`  perform pg_advisory_xact_lock_shared(
    public.device_use_slot_key(new.class_id,new.weekday,new.period_number));`, ''),
  },
  M13: {
    what: 'EC-010-010: đoán "open" thay vì báo lỗi khi không giải được giờ bắt đầu',
    apply: replace(`    raise exception 'DEVICE_POLICY_SESSION_TIME_UNRESOLVED'
      using errcode='P0001',
            hint='Không xác định được giờ bắt đầu của buổi học nên không thể áp dụng chính sách thiết bị.';`,
      "    return 'open';"),
  },
  M14: {
    what: 'EC-010-001: bỏ ràng buộc "chỉ một khoảng đang mở"',
    apply: replace(`create unique index if not exists device_use_lock_intervals_one_open
  on public.device_use_lock_intervals(class_id,weekday,period_number)
  where unlocked_at is null;`, ''),
  },
  M15: {
    what: 'DEC-107: hàm tính lại cũng đụng vào status, nên policy kích hoạt review',
    apply: replace(`    update public.registrations r
       set effective_uses_electronic_device = t.eff
      from target t`,
      `    update public.registrations r
       set effective_uses_electronic_device = t.eff, status = r.status
      from target t`),
  },
  M16: {
    what: 'DEC-106: AND thành OR — policy tự bật thiết bị cho người không xin',
    apply: replace(`  select coalesce(p_requested,false)
     and public.device_use_policy_state(p_class_id,p_week_id,p_weekday,p_period_number) <> 'locked'`,
      `  select coalesce(p_requested,false)
      or public.device_use_policy_state(p_class_id,p_week_id,p_weekday,p_period_number) <> 'locked'`),
  },
  M17: {
    what: 'BR-010-007: cho phép hủy override sau khi buổi đã bắt đầu',
    apply: replace(`    if v_start <= v_now then
      raise exception 'DEVICE_POLICY_SESSION_ALREADY_STARTED' using errcode='42501';
    end if;`, ''),
  },
  M18: {
    what: 'BR-010-008: khoá ghi đè luôn lựa chọn gốc của học sinh',
    apply: replace(`  new.effective_uses_electronic_device := public.device_use_effective(
    new.uses_electronic_device, new.class_id, new.week_id, new.weekday, new.period_number);`,
      `  new.effective_uses_electronic_device := public.device_use_effective(
    new.uses_electronic_device, new.class_id, new.week_id, new.weekday, new.period_number);
  new.uses_electronic_device := new.effective_uses_electronic_device;`),
  },
};

// Appended after the first full run, once the trigger-order test existed.
mutations.M19 = {
  what: 'đổi tên trigger để nó chạy trước trigger điền class_id',
  apply: text => {
    const find = 'create trigger trg_06_apply_device_use_policy';
    if (!text.includes(find)) throw new Error('mutation không tìm thấy đoạn cần sửa');
    return text
      .split('drop trigger if exists trg_06_apply_device_use_policy on public.registrations;')
      .join('drop trigger if exists trg_00a_apply_device_use_policy on public.registrations;')
      .split(find).join('create trigger trg_00a_apply_device_use_policy');
  },
};

// ---------------------------------------------------------------------------
// Sol RC1 fixes. Same bar: a mutation that no test notices is a defective test.
// ---------------------------------------------------------------------------

mutations.M20 = {
  what: 'RC1-P1: allow_session gắn vào một khoảng bất kỳ của slot, không phải khoảng đang khoá buổi đó',
  apply: replace('    v_interval := public.device_use_locking_interval(v_class,v_week,v_wd,v_pn,v_start);',
    `    select i.id into v_interval from public.device_use_lock_intervals i
      where i.class_id=v_class and i.weekday=v_wd and i.period_number=v_pn
      order by i.locked_at desc limit 1;`),
};

mutations.M21 = {
  what: 'RC1-P1: đánh giá override theo lớp+tuần+ô thay vì theo khoảng khoá — override chu kỳ cũ sống lại',
  apply: replace(`   where o.interval_id = p_interval_id and o.week_id = p_week_id`,
    `   where o.class_id = (select i.class_id from public.device_use_lock_intervals i
                            where i.id = p_interval_id) and o.week_id = p_week_id`),
};

mutations.M22 = {
  what: 'RC1-P2: state quay lại dùng lịch nền thay vì lịch hiệu lực của tuần',
  apply: replace('      from public.device_use_week_slots(v_class,v_week) s',
    `      from (select distinct weekday,period_number from public.study_schedule
              where class_id=v_class and is_study_period=true) s`),
};

mutations.M23 = {
  what: 'RC1-P3: cấp lại EXECUTE hàm trợ giúp cho client',
  apply: replace(
    'revoke all on function public.device_use_policy_state(uuid,uuid,integer,integer) from public, anon, authenticated;',
    'grant execute on function public.device_use_policy_state(uuid,uuid,integer,integer) to authenticated;'),
};

mutations.M24 = {
  what: 'RC1-§8: history dùng chung kiểm tra quyền với state — học sinh đọc được ai bấm nút',
  apply: replace(`  elsif p_action = 'history' then
    if not v_manager then`,
    `  elsif p_action = 'history' then
    if not coalesce(v_manager or v_class = public.current_student_class_id(), false) then`),
};

mutations.M25 = {
  what: 'RC1-§8: state trả bản đầy đủ cho mọi người, kể cả học sinh',
  apply: replace('        case when v_manager then jsonb_build_object(', '        case when true then jsonb_build_object('),
};

mutations.M26 = {
  what: 'RC1-§10: current_recurring_state chỉ lặp lại state của buổi đang xem',
  apply: replace(`               'current_recurring_state',case when exists(
                   select 1 from public.device_use_lock_intervals i
                    where i.class_id=v_class and i.weekday=s.weekday
                      and i.period_number=s.period_number and i.unlocked_at is null)
                 then 'locked' else 'open' end,`,
    `               'current_recurring_state',public.device_use_policy_state(v_class,v_week,s.weekday,s.period_number),`),
};

mutations.M27 = {
  what: 'RC1-§8: mở lại quyền đọc thẳng bảng policy cho học sinh của lớp',
  apply: replace(`create policy device_use_lock_intervals_select_v010 on public.device_use_lock_intervals
  for select to authenticated using (public.can_manage_class(class_id));`,
    `create policy device_use_lock_intervals_select_v010 on public.device_use_lock_intervals
  for select to authenticated
  using (public.can_manage_class(class_id) or class_id = public.current_student_class_id());`),
};

// ---------------------------------------------------------------------------
// Sol RC2 §8 — the signal that reaches students.
// ---------------------------------------------------------------------------

mutations.M28 = {
  what: 'RC2-§8: tín hiệu chỉ cho người quản lý đọc — học sinh lại không nhận được realtime',
  apply: replace(
    "  using (coalesce(public.can_manage_class(class_id) or class_id = public.current_student_class_id(), false));",
    '  using (public.can_manage_class(class_id));'),
};

mutations.M29 = {
  what: 'RC2-§8: Lock không phát tín hiệu',
  apply: replace(`    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_lock'`,
    `    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_lock'`),
};

mutations.M30 = {
  what: 'RC2-§8: Unlock không phát tín hiệu',
  apply: replace(`    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_unlock'`,
    `    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_unlock'`),
};

mutations.M31 = {
  what: 'RC2-§8: mở riêng / hủy mở riêng không phát tín hiệu',
  apply: text => {
    let out = text;
    for (const action of ['allow_session', 'revoke_allow']) {
      const find = `    perform public.device_use_bump_signal(v_class);
    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_${action}'`;
      if (out.split(find).length - 1 !== 1) throw new Error(`mutation phải khớp 1 chỗ cho ${action}`);
      out = out.split(find).join(`    insert into public.audit_logs(actor_id,class_id,action,entity_type,entity_id,new_data,source)
      values(auth.uid(),v_class,'device_use_${action}'`);
    }
    return out;
  },
};

mutations.M32 = {
  what: 'RC2-§8: tín hiệu mang thêm ai vừa đổi policy — mở lại đúng thứ §8 đóng',
  apply: replace(`create table if not exists public.device_use_policy_signals(
  class_id uuid primary key references public.classes(id) on delete cascade,
  version bigint not null default 1,
  changed_at timestamptz not null default now()
);`,
    `create table if not exists public.device_use_policy_signals(
  class_id uuid primary key references public.classes(id) on delete cascade,
  version bigint not null default 1,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);`),
};

mutations.M33 = {
  what: 'RC2-§8: mở cho client ghi thẳng vào bảng tín hiệu',
  apply: replace(
    'revoke all on public.device_use_policy_signals from anon, authenticated;\ngrant select on public.device_use_policy_signals to authenticated;',
    `grant select, insert, update on public.device_use_policy_signals to authenticated;
create policy device_use_policy_signals_write_mut on public.device_use_policy_signals for all to authenticated using (true) with check (true);`),
};

// ---------------------------------------------------------------------------
// Sol RC3 R-002 — the ACL the production default privileges actually produce.
// These only mean anything because tests/feat-010/baseline.sql now models
// `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO anon, …`.
// ---------------------------------------------------------------------------

mutations.M34 = {
  what: 'RC3-R-002: wrapper chỉ revoke khỏi PUBLIC — anon giữ nguyên EXECUTE tường minh',
  apply: replace('revoke all on function public.device_use_policy(text,jsonb) from public, anon, authenticated;',
    'revoke all on function public.device_use_policy(text,jsonb) from public;'),
};

mutations.M35 = {
  what: 'RC3-R-002: bỏ hàm trigger khỏi danh sách thu hồi',
  apply: replace('revoke all on function public.apply_device_use_policy() from public, anon, authenticated;\n', ''),
};

mutations.M36 = {
  what: 'RC3-R-002: bảng tín hiệu chỉ revoke khỏi authenticated — anon giữ toàn quyền DML',
  apply: replace('revoke all on public.device_use_policy_signals from anon, authenticated;',
    'revoke all on public.device_use_policy_signals from authenticated;'),
};

// ---------------------------------------------------------------------------
// Sol RC4 R-003 + Sol RC5 R-004/R-005 — the FEAT-007 year write-freeze.
// ---------------------------------------------------------------------------

mutations.M37 = {
  what: 'RC4-R-003: bỏ chốt chặn năm học khỏi wrapper — nhánh no-op lọt qua',
  apply: replace('    perform public.device_use_assert_year_writable(v_class);\n', ''),
};

mutations.M38 = {
  what: 'RC4-R-003: chỉ chặn năm đã lưu trữ, thả `archiving` — nửa bản sửa',
  apply: replace("  if v_state is distinct from 'active' then",
    "  if v_state = 'archived_read_only' then"),
};

mutations.M39 = {
  what: 'RC4-R-003: chốt chặn đặt trước cả nhánh đọc — năm đã lưu trữ thành không xem được',
  apply: replace('  v_manager := public.can_manage_class(v_class);\n',
    `  v_manager := public.can_manage_class(v_class);
  perform public.device_use_assert_year_writable(v_class);
`),
};

// RC9 replaces the migration-13 bindings, so these mutations must target 14.
mutations.M40 = {
  file: '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql',
  what: 'RC5-R-004: bỏ hai trigger đang hoạt động — owner ghi thẳng năm frozen được',
  apply: replace('commit;', `drop trigger trg_00_device_use_year_freeze on public.device_use_lock_intervals;
drop trigger trg_00_device_use_year_freeze on public.device_use_session_overrides;
commit;`),
};

mutations.M41 = {
  file: '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql',
  what: 'RC5-R-004: đảo điều kiện đổi owner — không kiểm OLD khi chuyển lớp',
  apply: replace('and old.class_id is distinct from new.class_id',
    'and old.class_id is not distinct from new.class_id'),
};

mutations.M42 = {
  what: 'RC5-R-005: FOR KEY SHARE thay vì FOR SHARE — không xung đột với archive_begin',
  apply: replace('   for share of y;', '   for key share of y;'),
};

mutations.M43 = {
  what: 'RC5-R-005: đọc archive_state mà không khoá dòng năm học',
  apply: replace('   where c.id = p_class_id\n   for share of y;', '   where c.id = p_class_id;'),
};

mutations.M44 = {
  file: '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql',
  what: 'RC5-R-004: interval trigger chỉ chạy INSERT/UPDATE — xoá trực tiếp năm frozen được',
  apply: replace(`  before insert or update or delete
  on public.device_use_lock_intervals`, `  before insert or update
  on public.device_use_lock_intervals`),
};

// ---------------------------------------------------------------------------
// Sol RC6 R-006/R-007 — one owner for an override, and one mutation path.
// ---------------------------------------------------------------------------

mutations.M45 = {
  what: 'RC6-R-006: FK một cột thay vì FK hợp thành — override lại trỏ được sang lớp khác',
  apply: replace(`      foreign key (interval_id, class_id, weekday, period_number)
      references public.device_use_lock_intervals(id, class_id, weekday, period_number)`,
    `      foreign key (interval_id)
      references public.device_use_lock_intervals(id)`),
};

mutations.M46 = {
  // First cut of this one only narrowed the FK and left the unique key alone,
  // so the migration itself failed to install and **every** test went red. The
  // runner read 54 failures as an emphatic catch; it proved nothing except that
  // a broken schema breaks everything. A mutation has to leave a *working*
  // system that is wrong in exactly one way — hence the unique key moves too.
  what: 'RC6-R-006: FK hợp thành bỏ thứ và tiết — override lệch buổi với khoảng khoá của nó',
  apply: text => replace(
    '      unique (id, class_id, weekday, period_number);',
    '      unique (id, class_id);')(
      replace(`      foreign key (interval_id, class_id, weekday, period_number)
      references public.device_use_lock_intervals(id, class_id, weekday, period_number)`,
        `      foreign key (interval_id, class_id)
      references public.device_use_lock_intervals(id, class_id)`)(text)),
};

mutations.M47 = {
  what: 'RC6-R-006: bỏ trigger kiểm tuần — override dùng được tuần của năm học khác',
  apply: replace(`drop trigger if exists trg_01_device_use_override_week on public.device_use_session_overrides;
create trigger trg_01_device_use_override_week
  before insert or update of class_id, week_id on public.device_use_session_overrides
  for each row execute function public.device_use_guard_override_week();
`, ''),
};

mutations.M48 = {
  what: 'RC6-R-006: kiểm tuần chỉ cần tuần tồn tại, không cần cùng năm học',
  apply: replace('     where c.id = new.class_id and c.school_year_id = w.school_year_id) then',
    '     where c.id = new.class_id) then'),
};

mutations.M49 = {
  what: 'RC6-R-007: trả lại DML cho service_role — API ghi thứ hai với bất biến yếu hơn',
  apply: replace(`revoke all on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals from service_role;
grant select on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals to service_role;`,
    `grant all on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals to service_role;`),
};

// ---------------------------------------------------------------------------
// Sol RC7 R-008 — the manager response and the evaluator answer one question.
// ---------------------------------------------------------------------------

mutations.M50 = {
  what: 'RC7-R-008: JSON của người quản lý tự tra override theo lớp+tuần+ô — chính là mã RC7 đã gửi',
  apply: replace(
    "               'override_id',public.device_use_live_override(u.iv,v_week,s.weekday,s.period_number,t.ss))",
    `               'override_id',(select o.id from public.device_use_session_overrides o
                               where o.class_id=v_class and o.week_id=v_week and o.weekday=s.weekday
                                 and o.period_number=s.period_number and o.revoked_at is null))`),
};

// ---------------------------------------------------------------------------
// Sol RC8 R-009 + Sol RC9-patch R-010 — class lifecycle and two-sided freeze.
// These mutations target migration 14, the RC8 -> RC9 upgrade path.
// ---------------------------------------------------------------------------

mutations.M51 = {
  file: '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql',
  what: 'RC9-R-009: bỏ parent-missing DELETE bypass — class cascade lại gãy như RC8',
  apply: replace(`    if not exists (
      select 1
      from public.classes c
      where c.id = old.class_id
    ) then
      return old;
    end if;

`, ''),
};

mutations.M52 = {
  file: '14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql',
  what: 'RC9-R-010: bỏ OLD-side UPDATE guard — mang row ra khỏi năm frozen được',
  apply: replace(`  if tg_op = 'UPDATE'
     and old.class_id is distinct from new.class_id
  then
    perform public.device_use_assert_year_writable(old.class_id);
  end if;

`, ''),
};

