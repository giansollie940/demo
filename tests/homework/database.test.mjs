import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {createFixture,ids} from './fixture.mjs';
const db=await createFixture();
let sql = "";
try {
  sql = await readFile(
    new URL("../../database/upgrade/05-FEAT-001-BAO-BAI.sql", import.meta.url),
    "utf8",
  );
} catch {}
await test("migration supplies the authenticated homework API", async () => {
  if (sql) await db.exec(sql);
  if (process.env.FEAT002_UPGRADE) for (const file of ['06-FEAT-001-AI-RECOVERY.sql','07-FEAT-002-PERMISSIONS-LIFECYCLE.sql'])
    await db.exec(await readFile(new URL('../../database/upgrade/'+file, import.meta.url),'utf8'));
  if(process.env.FEAT004_UPGRADE)await db.exec(await readFile(new URL('../../database/upgrade/08-FEAT-004-MULTI-CLASS-CATALOG.sql',import.meta.url),'utf8'));
  const r = await db.query(
    "select to_regprocedure('public.homework_api(text,jsonb)')::text name",
  );
  assert.ok(r.rows[0].name, "FEAT-001 API is absent");
});
if (!sql) {
  await db.close();
  process.exitCode = 1;
} else {
  async function rpc(actor, action, p = {}) {
    if(process.env.FEAT004_UPGRADE && actor===ids.t && action==='subject_save' && p.name){
      const cat=await rpc(ids.a,'catalog_save',{grade:7,...p});
      return rpc(actor,action,{catalog_subject_id:cat.id});
    }
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub','${actor}',false); set role authenticated;`,
    );
    try {
      return (
        await db.query("select public.homework_api($1,$2::jsonb) result", [
          action,
          JSON.stringify({ class_id: ids.c, ...p }),
        ])
      ).rows[0].result;
    } finally {
      await db.exec("reset role");
    }
  }
  async function server(action, p) {
    await db.exec("set role service_role");
    try {
      return (
        await db.query("select public.homework_ai($1,$2::jsonb) result", [
          action,
          JSON.stringify(p),
        ])
      ).rows[0].result;
    } finally {
      await db.exec("reset role");
    }
  }
  const subject = await rpc(ids.t, "subject_save", {
    name: "KHTN",
    short_name: "KHTN",
    icon: "🌿",
  });
  let n1, n2;
  await test("student cannot configure subjects or impersonate author", async () => {
    await assert.rejects(rpc(ids.s, "subject_save", { name: "X" }));
    n1 = await rpc(ids.s, "submit", {
      subject_id: subject.id,
      title: "PHT 14",
      content: "Hoàn thành phiếu",
      due_at: "2026-09-10T13:00:00Z",
      author_id: ids.a,
      request_id: crypto.randomUUID(),
    });
    assert.equal(n1.author_id, ids.s);
    assert.equal(n1.status, "pending_duplicate_review");
  });
  await test("student cannot publish through direct API or call AI finalizer", async () => {
    await assert.rejects(
      rpc(ids.s, "review", {
        id: n1.id,
        decision: "keep_both",
        reason: "bypass",
      }),
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.homework_ai($1,$2::jsonb)", ["finish", "{}"]),
    );
    await assert.rejects(
      db.exec("insert into public.homework_notices default values"),
    );
    await db.exec("reset role");
  });
  await test("AI accepts a checked snapshot, publishes and prevents own heart", async () => {
    let snap = await server("snapshot", { id: n1.id });
    await server("finish", {
      id: n1.id,
      revision: snap.notice.revision,
      fingerprint: snap.fingerprint,
      score: 0,
      reason: "No candidates",
    });
    await assert.rejects(rpc(ids.s, "heart", { id: n1.id, liked: true }));
    await rpc(ids.other, "heart", { id: n1.id, liked: true });
    await rpc(ids.other, "heart", { id: n1.id, liked: true });
    assert.equal(
      (await db.query("select count(*)::int n from homework_notice_reactions"))
        .rows[0].n,
      1,
    );
  });
  await test("duplicate stays private; monitor never receives AI score or reason", async () => {
    n2 = await rpc(ids.other, "submit", {
      subject_id: subject.id,
      title: "PHT bài 14",
      content: "Làm phiếu bài 14",
      due_at: "2026-09-10T13:00:00Z",
      request_id: crypto.randomUUID(),
    });
    let snap = await server("snapshot", { id: n2.id });
    await server("finish", {
      id: n2.id,
      revision: snap.notice.revision,
      fingerprint: snap.fingerprint,
      score: 80,
      candidate_id: n1.id,
      reason: "SECRET_REASON",
    });
    const s = await rpc(ids.s, "load");
    assert.equal(
      s.notices.some((n) => n.id === n2.id),
      false,
    );
    const m = await rpc(ids.m, "load");
    assert.equal(m.queue.length, 1);
    assert.equal(JSON.stringify(m).includes("SECRET_REASON"), false);
    assert.equal("score" in m.queue[0], false);
    await assert.rejects(
      rpc(ids.m, "review", {
        id: n2.id,
        decision: "keep_both",
        reason: "override",
      }),
    );
  });
  await test("keep both requires a reason; both count; teacher cannot configure achievement", async () => {
    await assert.rejects(
      rpc(ids.t, "review", { id: n2.id, decision: "keep_both", reason: " " }),
    );
    await rpc(ids.t, "review", {
      id: n2.id,
      decision: "keep_both",
      reason: "Hai phần khác nhau",
    });
    assert.equal((await rpc(ids.s, "load")).notices.length, 2);
    await assert.rejects(rpc(ids.t, "settings", { seed_threshold: 4 }));
    await assert.rejects(rpc(ids.a, "settings", { seed_threshold: 0 }));
    await rpc(ids.a, "settings", { seed_threshold: 4 });
    assert.equal((await rpc(ids.a, "load")).settings.seed_threshold, 4);
  });
  await test("reminder is shared across actors and rejected events are not recorded", async () => {
    await rpc(ids.m, "remind", { id: n1.id });
    await assert.rejects(rpc(ids.t, "remind", { id: n1.id }));
    await assert.rejects(rpc(ids.s, "remind", { id: n2.id }));
    assert.equal(
      (await db.query("select count(*)::int n from homework_notice_reminders"))
        .rows[0].n,
      1,
    );
  });
  await test("soft deletion removes public eligibility; restore preserves history", async () => {
    await rpc(ids.s, "delete", { id: n1.id, reason: "Sai nội dung" });
    assert.equal((await rpc(ids.other, "load")).notices.length, 1);
    await assert.rejects(rpc(ids.other, "heart", { id: n1.id, liked: true }));
    await assert.rejects(rpc(ids.m, "restore", { id: n1.id }));
    await rpc(ids.t, "restore", { id: n1.id });
    assert.equal((await rpc(ids.s, "load")).notices.length, 2);
  });

  await test("candidate deadline window includes 24h and excludes 24h plus one second", async () => {
    const x = await rpc(ids.other, "submit", {
      subject_id: subject.id,
      title: "Boundary",
      content: "Khác",
      due_at: "2026-09-11T13:00:00Z",
      request_id: crypto.randomUUID(),
    });
    let snap = await server("snapshot", { id: x.id });
    assert.ok(snap.candidates.some((c) => c.id === n1.id));
    await rpc(ids.other, "submit", {
      id: x.id,
      revision: x.revision,
      subject_id: subject.id,
      title: "Boundary",
      content: "Khác",
      due_at: "2026-09-11T13:00:01Z",
    });
    snap = await server("snapshot", { id: x.id });
    assert.equal(
      snap.candidates.some((c) => c.id === n1.id),
      false,
    );
  });
  await test("24h deadline edits require a fresh check and invalidate in-flight snapshots", async () => {
    const before = (await rpc(ids.s, "load")).notices.find(
      (n) => n.id === n1.id,
    );
    let edited = await rpc(ids.s, "submit", {
      id: n1.id,
      revision: before.revision,
      subject_id: subject.id,
      title: before.title,
      content: before.content,
      due_at: "2026-09-11T13:00:00Z",
    });
    assert.equal(edited.status, "pending_duplicate_review");
    let snap = await server("snapshot", { id: n1.id });
    await rpc(ids.s, "submit", {
      id: n1.id,
      revision: edited.revision,
      subject_id: subject.id,
      title: before.title,
      content: "Nội dung mới",
      due_at: "2026-09-11T13:00:00Z",
    });
    const stale = await server("finish", {
      id: n1.id,
      revision: snap.notice.revision,
      fingerprint: snap.fingerprint,
      score: 0,
      reason: "stale",
    });
    assert.equal(stale.stale, true);
    const fresh = await server("snapshot", { id: n1.id });
    await server("finish", {
      id: n1.id,
      revision: fresh.notice.revision,
      fingerprint: fresh.fingerprint,
      score: 0,
      reason: "Nội dung mới đã được kiểm tra trên snapshot hiện hành",
    });
  });
  await test("English group scopes feed, posting, duplicate candidates and notifications", async () => {
    const eng = await rpc(ids.t, "subject_save", {
      name: "Tiếng Anh",
      is_english: true,
    });
    const g1 = await rpc(ids.t, "group_save", { name: "E1" }),
      g2 = await rpc(ids.t, "group_save", { name: "E2" });
    await rpc(ids.t, "group_assign", {
      student_id: ids.s,
      english_group_id: g1.id,
    });
    await rpc(ids.t, "group_assign", {
      student_id: ids.other,
      english_group_id: g2.id,
    });
    await assert.rejects(
      rpc(ids.s, "submit", {
        subject_id: eng.id,
        english_group_id: g2.id,
        title: "E2",
        content: "secret",
        due_at: "2026-09-12T13:00:00Z",
        request_id: crypto.randomUUID(),
      }),
    );
    const x = await rpc(ids.other, "submit", {
      subject_id: eng.id,
      english_group_id: g2.id,
      title: "E2 private",
      content: "secret",
      due_at: "2026-09-12T13:00:00Z",
      request_id: crypto.randomUUID(),
    });
    let snap = await server("snapshot", { id: x.id });
    await server("finish", {
      id: x.id,
      revision: 1,
      fingerprint: snap.fingerprint,
      score: 0,
      reason: "ok",
    });
    assert.equal(
      (await rpc(ids.s, "load")).notices.some((n) => n.id === x.id),
      false,
    );
    assert.equal(
      (await rpc(ids.m, "load")).notices.some((n) => n.id === x.id),
      true,
    );
    await rpc(ids.m, "remind", { id: x.id });
    assert.equal(
      (await rpc(ids.s, "inbox")).some((n) => n.notice_id === x.id),
      false,
    );
    await rpc(ids.t, "group_assign", {
      student_id: ids.other,
      english_group_id: g1.id,
    });
    assert.equal(
      (await rpc(ids.other, "inbox")).some((n) => n.notice_id === x.id),
      false,
    );
    const x2 = await rpc(ids.s, "submit", {
      subject_id: eng.id,
      english_group_id: g1.id,
      title: "E2 private",
      content: "secret",
      due_at: "2026-09-12T13:00:00Z",
      request_id: crypto.randomUUID(),
    });
    snap = await server("snapshot", { id: x2.id });
    assert.equal(
      snap.candidates.some((c) => c.id === x.id),
      false,
    );
  });
  await test("rolling reminder quotas enforce 6h spacing, two per notice and ten per actor", async () => {
    await db.exec(
      `update homework_notice_reminders set sent_at=now()-interval '6 hours 1 second' where notice_id='${n1.id}'`,
    );
    await rpc(ids.t, "remind", { id: n1.id });
    await db.exec(
      `update homework_notice_reminders set sent_at=now()-interval '6 hours 1 second' where notice_id='${n1.id}'`,
    );
    await assert.rejects(rpc(ids.m, "remind", { id: n1.id }));
    await db.exec(
      `update homework_notice_reminders set sent_at=now()-interval '24 hours 1 second' where notice_id='${n1.id}'`,
    );
    await rpc(ids.m, "remind", { id: n1.id });
    await db.exec(
      `insert into homework_notice_reminders(notice_id,sent_by,sent_at) select '${n2.id}','${ids.t}',now()-interval '12 hours' from generate_series(1,10)`,
    );
    // Clear notice-level blockers so only the actor quota can reject this call.
    await db.exec(`update homework_notice_reminders set sent_at=now()-interval '25 hours' where notice_id='${n1.id}'`);
    const count = (
      await db.query("select count(*)::int n from homework_notice_reminders")
    ).rows[0].n;
    await assert.rejects(rpc(ids.t, "remind", { id: n1.id }));
    assert.equal(
      (await db.query("select count(*)::int n from homework_notice_reminders"))
        .rows[0].n,
      count,
    );
  });
  await test("backlog only reaches opted-in admin, throttles and re-arms after resolution", async () => {
    await db.exec(
      `update homework_notices set pending_since=now() where status='pending_duplicate_review'`,
    );
    for (let i = 0; i < 5; i++) {
      const x = await rpc(ids.s, "submit", {
        subject_id: subject.id,
        title: "Backlog " + i,
        content: "Task",
        due_at: "2026-09-15T13:00:00Z",
        request_id: crypto.randomUUID(),
      });
      await db.exec(
        `update homework_notices set pending_since=now()-interval '24 hours 1 second' where id='${x.id}'`,
      );
    }
    let inbox = await rpc(ids.a, "inbox");
    assert.equal(inbox.filter((n) => n.kind === "backlog").length, 0);
    await rpc(ids.a, "alert_settings", { alert_level: "backlog" });
    inbox = await rpc(ids.a, "inbox");
    assert.equal(inbox.filter((n) => n.kind === "backlog").length, 1);
    inbox = await rpc(ids.a, "inbox");
    assert.equal(inbox.filter((n) => n.kind === "backlog").length, 1);
    await db.exec(
      `update homework_notices set pending_since=now() where status='pending_duplicate_review'`,
    );
    await rpc(ids.a, "inbox");
    await db.exec(
      `update homework_notices set pending_since=now()-interval '25 hours' where status='pending_duplicate_review'`,
    );
    inbox = await rpc(ids.a, "inbox");
    assert.equal(inbox.filter((n) => n.kind === "backlog").length, 2);
  });
  await test("inactive actors and cross-class requests cannot use the API; all new tables have RLS", async () => {
    await db.exec(`update profiles set active=false where id='${ids.s}'`);
    await assert.rejects(rpc(ids.s, "load"));
    await db.exec(`update profiles set active=true where id='${ids.s}'`);
    const c2 = crypto.randomUUID();
    await db.exec(`insert into classes(id,school_year_id,active${process.env.FEAT004_UPGRADE?',grade':''}) values('${c2}','${ids.y}',true${process.env.FEAT004_UPGRADE?',8':''})`);
    await assert.rejects(rpc(ids.s, "load", { class_id: c2 }));
    const tables = await db.query(
      "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and (relname like 'homework_%' or relname in ('class_subjects','english_groups','english_group_members'))",
    );
    assert.ok(tables.rows.length >= 12);
    assert.ok(tables.rows.every((t) => t.relrowsecurity));
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select public.homework_api($1,$2::jsonb)", [
        "load",
        JSON.stringify({ class_id: ids.c }),
      ]),
    );
    await db.exec("reset role");
  });

  await test('Admin all-alert opt-in receives normal events, and deactivation prevents late publication',async()=>{
    await rpc(ids.a,'alert_settings',{alert_level:'all'});
    const x=await rpc(ids.other,'submit',{subject_id:subject.id,title:'Late result',content:'Test',due_at:'2026-10-01T13:00:00Z',request_id:crypto.randomUUID()});
    let snap=await server('snapshot',{id:x.id});
    await server('finish',{id:x.id,revision:1,fingerprint:snap.fingerprint,score:0,reason:'ok'});
    assert.ok((await rpc(ids.a,'inbox')).some(n=>n.notice_id===x.id&&n.kind==='published'));
    const z=await rpc(ids.other,'submit',{subject_id:subject.id,title:'Deactivated',content:'Test',due_at:'2026-10-08T13:00:00Z',request_id:crypto.randomUUID()});
    snap=await server('snapshot',{id:z.id});await db.exec(`update profiles set active=false where id='${ids.other}'`);
    await server('finish',{id:z.id,revision:1,fingerprint:snap.fingerprint,score:0,reason:'late'});
    assert.equal((await db.query('select status from homework_notices where id=$1',[z.id])).rows[0].status,'pending_duplicate_review');
    await db.exec(`update profiles set active=true where id='${ids.other}'`);
  });
  await test('required deadline, AI thresholds, teacher decisions and current-validity rankings',async()=>{
    const sub=await rpc(ids.t,'subject_save',{name:'Ngữ văn',short_name:'Văn'});
    const payload={subject_id:sub.id,title:'Đọc hiểu',content:'Trả lời câu hỏi',due_at:'2026-09-12T13:00:00Z'};
    await assert.rejects(rpc(ids.s,'submit',{...payload,due_at:null,request_id:crypto.randomUUID()}));
    async function make(actor,score,candidate){
      const n=await rpc(actor,'submit',{...payload,request_id:crypto.randomUUID()});
      const snap=await server('snapshot',{id:n.id});
      const result=await server('finish',{id:n.id,revision:n.revision,fingerprint:snap.fingerprint,score,candidate_id:candidate,reason:'Boundary test'});
      return {...n,status:result.status};
    }
    const original=await make(ids.s,0);
    const pending=await make(ids.other,70,original.id);
    assert.equal(pending.status,'pending_duplicate_review');
    const rejected=await make(ids.m,90,original.id);
    assert.equal(rejected.status,'duplicate_rejected');
    assert.ok((await rpc(ids.m,'load')).history.some(x=>x.id===rejected.id));
    assert.ok(!(await rpc(ids.m,'load')).queue.some(x=>x.id===rejected.id));
    await rpc(ids.t,'review',{id:pending.id,decision:'keep_existing'});
    assert.equal((await db.query('select status from homework_notices where id=$1',[pending.id])).rows[0].status,'duplicate_rejected');
    await rpc(ids.t,'review',{id:rejected.id,decision:'replace_existing'});
    assert.equal((await db.query('select status from homework_notices where id=$1',[original.id])).rows[0].status,'replaced');
    const next=await rpc(ids.s,'submit',{...payload,request_id:crypto.randomUUID()});
    const fresh=await server('snapshot',{id:next.id});
    assert.ok(!fresh.candidates.some(x=>[original.id,pending.id].includes(x.id)),'Resolved invalid notices must not suppress a new notice');
    assert.ok(fresh.candidates.some(x=>x.id===rejected.id));
    await rpc(ids.other,'heart',{id:rejected.id,liked:true});
    await rpc(ids.a,'settings',{seed_threshold:1});
    await assert.rejects(rpc(ids.a,'settings',{seed_threshold:1.5}));
    await assert.rejects(rpc(ids.a,'settings',{seed_threshold:1,allow_self_heart:true}));
    for(const action of ['review','ai_settings','settings'])await assert.rejects(rpc(ids.m,action,{id:pending.id,decision:'keep_both',seed_threshold:3,pending_threshold:60,reject_threshold:80}));
    const weekId=crypto.randomUUID();
    await db.query("insert into weeks values($1,$2,'2026-09-07','2026-09-13',1)",[weekId,ids.y]);
    await db.query("update homework_notices set published_at='2026-09-09T05:00:00Z' where id=$1",[rejected.id]);
    await db.query("update homework_notice_reactions set created_at='2026-09-09T05:01:00Z' where notice_id=$1",[rejected.id]);
    const board=(await rpc(ids.t,'load',{week_id:weekId})).leaderboard;
    assert.ok(board.every(x=>![ids.t,ids.a].includes(x.id)));
    const m=board.find(x=>x.id===ids.m);assert.ok(m.notices>=1);assert.ok(m.hearts>=1);assert.ok(m.seed_at);
    for(const row of board){
      const expected=(await db.query("select count(*)::int n from homework_notices where author_id=$1 and class_id=$2 and status='published' and published_at>='2026-09-06T17:00:00Z' and published_at<'2026-09-13T17:00:00Z'",[row.id,ids.c])).rows[0].n;
      assert.equal(row.notices,expected);
      for(const peer of board)if(row.notices===peer.notices)assert.equal(row.notice_rank,peer.notice_rank);
      assert.equal('points' in row,false);
    }
    await rpc(ids.t,'delete',{id:rejected.id,reason:'Test invalidation'});
    const after=(await rpc(ids.t,'load',{week_id:weekId})).leaderboard.find(x=>x.id===ids.m);
    assert.equal(after.notices,m.notices-1);assert.equal(after.hearts,m.hearts-1);
    await assert.rejects(rpc(ids.s,'delete',{id:n2.id,reason:'Cannot manage others'}));
  });
  await db.close();
}
