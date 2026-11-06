// Báo bài: kiểm tra hạn ngay trên form, cùng luật với máy chủ
// (homework_private.assert_due_not_past, supabase/migrations/20261106090000_homework_due_not_past.sql):
//   • hạn phải sau thời điểm đăng — bằng hoặc trước thì chặn;
//   • sửa bài mà giữ nguyên hạn thì không xét, kể cả khi hạn đó đã qua;
//   • hạn còn dưới 1 giờ thì chỉ cảnh báo.
// Máy chủ vẫn là nơi quyết định: đồng hồ của máy người dùng có thể lệch.

/** Mã ổn định máy chủ gửi kèm khi từ chối (hint của lỗi Postgres). */
export const DUE_IN_PAST = "HOMEWORK_DUE_IN_PAST";
export const SOON_MS = 60 * 60 * 1000;

export type DeadlineLevel = "ok" | "warn" | "block";
export interface DeadlineCheck {
  level: DeadlineLevel;
  message: string;
}

const label = (ms: number) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(ms));

/** "2026-11-06T14:05" (giờ Việt Nam, như ô datetime-local của form) → mốc thời gian, hoặc NaN. */
export function deadlineMs(local: string): number {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)
    ? new Date(`${local}:00+07:00`).getTime()
    : Number.NaN;
}

/**
 * local: giá trị ô "Hạn hoàn thành"; originalDue: hạn hiện có của bài đang sửa (ISO), rỗng khi đăng mới.
 * Ô hạn chỉ giữ tới phút, nên "giữ nguyên hạn" được so ở độ chính xác phút.
 */
export function checkDeadline(local: string, originalDue: string | null | undefined, now = Date.now()): DeadlineCheck {
  const due = deadlineMs(local);
  if (!Number.isFinite(due)) return { level: "ok", message: "" };
  if (originalDue) {
    const original = new Date(originalDue).getTime();
    if (Math.floor(original / 60000) === Math.floor(due / 60000)) return { level: "ok", message: "" };
  }
  if (due <= now) {
    return {
      level: "block",
      message: `Hạn ${label(due)} đã qua. Hạn của Báo bài phải sau thời điểm đăng (${label(now)}).`,
    };
  }
  if (due - now < SOON_MS) {
    const minutes = Math.max(1, Math.round((due - now) / 60000));
    return {
      level: "warn",
      message: `Hạn chỉ còn ${minutes} phút nữa. Kiểm tra lại ngày giờ trước khi đăng.`,
    };
  }
  return { level: "ok", message: "" };
}

/** Lỗi do máy chủ từ chối hạn đã qua (qua homework-review hay gọi thẳng homework_api). */
export function isDueInPastError(error: unknown): boolean {
  const e = error as { code?: string; hint?: string } | null;
  return e?.code === DUE_IN_PAST || e?.hint === DUE_IN_PAST;
}
