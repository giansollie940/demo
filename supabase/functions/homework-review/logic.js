const normalize = (value) =>
  String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("vi");

/** Candidates and scope come exclusively from the checked server snapshot. */
export async function reviewSnapshot(snapshot, semantic) {
  const { notice, candidates = [] } = snapshot;
  if (!candidates.length)
    return {
      score: 0,
      candidate_id: null,
      reason: "Không có bài trong phạm vi so sánh.",
    };
  const previous = snapshot.previous;
  if (
    snapshot.settings?.semantic_duplicate_enabled !== false &&
    previous?.status === "published" &&
    previous.subject_id === notice.subject_id &&
    previous.english_group_id === notice.english_group_id &&
    Math.abs(
      new Date(previous.due_at).getTime() - new Date(notice.due_at).getTime(),
    ) < 86400000
  ) {
    const change = await semantic({
      mode: "edit",
      previous: { title: previous.title, content: previous.content },
      notice: { title: notice.title, content: notice.content },
    });
    if (typeof change?.material_change !== "boolean")
      throw new Error("AI_INVALID_EDIT_RESULT");
    if (!change.material_change)
      return {
        score: 0,
        candidate_id: null,
        reason: "Chỉnh sửa nhỏ, giữ nguyên bài đã công bố.",
      };
  }
  const exact = candidates.find(
    (c) =>
      new Date(c.due_at).getTime() === new Date(notice.due_at).getTime() &&
      normalize(c.title) === normalize(notice.title) &&
      normalize(c.content) === normalize(notice.content),
  );
  if (exact)
    return {
      score: 100,
      candidate_id: exact.id,
      reason: "Trùng tiêu đề, nội dung chuẩn hóa và deadline.",
    };
  if (snapshot.settings?.semantic_duplicate_enabled === false)
    return { score: 0, candidate_id: null, reason: "Không trùng nội dung chuẩn hóa; semantic AI đang tắt." };
  // Evaluate all filtered candidates in bounded batches, never silently truncate.
  let best = { score: 0, candidate_id: null, reason: "Không trùng nhiệm vụ." };
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = candidates.slice(offset, offset + 8);
    const result = await semantic({
      mode: "duplicate",
      notice: {
        title: notice.title,
        content: notice.content,
        due_at: notice.due_at,
      },
      candidates: batch.map((c) => ({
        id: c.id,
        title: c.title,
        content: c.content,
        due_at: c.due_at,
      })),
    });
    if (
      !result ||
      typeof result.score !== "number" ||
      !Number.isFinite(result.score) ||
      result.score < 0 ||
      result.score > 100 ||
      typeof result.reason !== "string" ||
      result.reason.length > 2000 ||
      (result.candidate_id !== null &&
        !batch.some((c) => c.id === result.candidate_id)) ||
      (result.score > 0 && result.candidate_id === null)
    )
      throw new Error("AI_INVALID_RESULT");
    if (result.score > best.score) best = result;
  }
  return best;
}
