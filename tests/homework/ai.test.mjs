import { test } from "node:test";
import assert from "node:assert/strict";
let engine = {};
try {
  engine = await import("../../supabase/functions/homework-review/logic.js");
} catch {}
await test("exact duplicate bypasses semantic call; candidate scope is already server-filtered", async () => {
  assert.equal(typeof engine.reviewSnapshot, "function");
  let called = 0;
  const result = await engine.reviewSnapshot(
    {
      notice: {
        title: "  PHT 14 ",
        content: "Làm   phiếu",
        due_at: "2026-09-10T13:00:00Z",
      },
      candidates: [
        {
          id: "A",
          title: "pht 14",
          content: "làm phiếu",
          due_at: "2026-09-10T13:00:00Z",
        },
      ],
    },
    async () => {
      called++;
      throw Error("not expected");
    },
  );
  assert.equal(result.score, 100);
  assert.equal(result.candidate_id, "A");
  assert.equal(called, 0);
});
await test("semantic result cannot invent a candidate or coerce an invalid score", async () => {
  assert.equal(typeof engine.reviewSnapshot, "function");
  const snap = {
    notice: { title: "New", content: "B", due_at: "2026-09-10T13:00:00Z" },
    candidates: [
      { id: "A", title: "Old", content: "C", due_at: "2026-09-10T13:00:00Z" },
    ],
  };
  await assert.rejects(
    engine.reviewSnapshot(snap, async () => ({
      score: 99,
      candidate_id: "forged",
      reason: "x",
    })),
  );
  await assert.rejects(
    engine.reviewSnapshot(snap, async () => ({
      score: "90",
      candidate_id: "A",
      reason: "x",
    })),
  );
  const r = await engine.reviewSnapshot(snap, async () => ({
    score: 89.9,
    candidate_id: "A",
    reason: "same task",
  }));
  assert.equal(r.score, 89.9);
});
await test("empty candidates publish without an AI call", async () => {
  assert.equal(typeof engine.reviewSnapshot, "function");
  const r = await engine.reviewSnapshot(
    { notice: {}, candidates: [] },
    async () => {
      throw Error("called");
    },
  );
  assert.equal(r.score, 0);
});
await test("minor edits retain the prior publication; a 24h deadline change must compare candidates", async () => {
  const snap = {
    previous: {
      status: "published",
      subject_id: "S",
      english_group_id: null,
      title: "PHT14",
      content: "Làm bài",
      due_at: "2026-09-10T13:00:00Z",
    },
    notice: {
      subject_id: "S",
      english_group_id: null,
      title: "PHT 14",
      content: "Làm bài",
      due_at: "2026-09-10T14:00:00Z",
    },
    candidates: [
      {
        id: "A",
        title: "PHT14",
        content: "Làm bài",
        due_at: "2026-09-10T13:00:00Z",
      },
    ],
  };
  let kinds = [];
  const r = await engine.reviewSnapshot(snap, async (x) => {
    kinds.push(x.mode);
    return { material_change: false };
  });
  assert.equal(r.score, 0);
  assert.deepEqual(kinds, ["edit"]);
  snap.notice.due_at = "2026-09-11T13:00:00Z";
  kinds = [];
  await engine.reviewSnapshot(snap, async (x) => {
    kinds.push(x.mode);
    return { score: 80, candidate_id: "A", reason: "same task" };
  });
  assert.deepEqual(kinds, ["duplicate"]);
});
