import { legacyApi } from "../../services/legacy-supabase";
export interface Notice {
  id: string;
  class_id: string;
  subject_id: string;
  english_group_id: string | null;
  author_id: string;
  author_name: string;
  author_role: string;
  title: string;
  content: string;
  due_at: string;
  status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  revision: number;
  subject: string;
  icon: string;
  english_group: string | null;
  duplicate_of: string | null;
  hearts: number;
  liked: boolean;
  can_retry?: boolean;
  duplicate_tombstone_id?: string | null;
  decision?: string | null;
  candidate?: Notice | null;
  score?: number | null;
  reason?: string | null;
  delete_reason?: string;
}
export interface Subject {
  id: string;
  name: string;
  short_name: string;
  icon: string;
  sort_order: number;
  is_english: boolean;
  is_active: boolean;
}
export interface EnglishGroup {
  id: string;
  name: string;
  is_active: boolean;
}
export interface HomeworkNotification {
  id: string;
  title: string;
  message: string;
  kind: string;
  notice_id: string | null;
  is_read: boolean;
  created_at: string;
}
export interface HomeworkData {
  ai_settings?: { semantic_duplicate_enabled: boolean; duplicate_review_threshold: number; duplicate_auto_threshold: number };
  review_history?: Notice[];
  history_markers?: Array<{ notice_id: string; marker: string; original_created_at: string; hard_deleted_at: string }>;
  tombstones?: Array<{ notice_id: string; hard_deleted_at: string; event?: string; [key: string]: unknown }>;
  subjects: Subject[];
  groups: EnglishGroup[];
  notices: Notice[];
  history: Notice[];
  queue: Notice[];
  trash: Notice[];
  settings: {
    seed_threshold: number;

  };
  leaderboard: Array<{
    id: string;
    full_name: string;
    notices: number;
    hearts: number;
    year_notices: number;
    seed_at: string | null;
    notice_rank: number;
    heart_rank: number;
  }>;
  learners: Array<{ id: string; name: string }>;
  members: Array<{ student_id: string; english_group_id: string }>;
  audit: Array<{
    id: string;
    event_type: string;
    actor_id: string | null;
    notice_id: string | null;
    created_at: string;
    before_data: unknown;
    after_data: unknown;
  }>;
  notifications: HomeworkNotification[];
  alert_level?: string;
  health?: { total: number; pending: number };
}
interface Result {
  data: unknown;
  error: { message?: string; context?: Response } | null;
}
interface HomeworkClient {
  rpc(name: string, args: Record<string, unknown>): Promise<Result>;
  functions: { invoke(name: string, args: { body: unknown }): Promise<Result> };
}
async function client() {
  return (await legacyApi.init()) as HomeworkClient;
}
export async function homeworkRpc<T = unknown>(
  action: string,
  classId: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await (
    await client()
  ).rpc("homework_api", {
    p_action: action,
    p_data: { ...payload, class_id: classId },
  });
  if (error)
    throw new Error(error.message || "Không thể thực hiện thao tác Báo bài.");
  return data as T;
}
export async function submitHomework(
  classId: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await (
    await client()
  ).functions.invoke("homework-review", {
    body: { ...payload, class_id: classId },
  });
  if (error) {
    let message = error.message || "Chưa gửi được bài.";
    try {
      const body = await error.context?.json();
      message = body?.error || message;
    } catch {}
    throw new Error(message);
  }
  const result = data as {
    ok?: boolean;
    notice?: Notice;
    message?: string;
    error?: string;
  };
  if (!result.ok)
    throw new Error(result.error || "Chưa hoàn tất xử lý Báo bài.");
  return result;
}
export function localDeadline(value: string) {
  return value
    ? new Date(new Date(value).getTime() + 7 * 3600000)
        .toISOString()
        .slice(0, 16)
    : "";
}
export function utcDeadline(value: string) {
  if (!value) return "";
  return new Date(`${value}:00+07:00`).toISOString();
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export const stateLabels: Record<string, string> = {
  published: "✅ Đã đăng",
  pending_duplicate_review: "🟡 Chờ GV xử lý",
  duplicate_rejected: "⚠️ Trùng nội dung",
  replaced: "🔄 Được thay thế",
  deleted: "🗑️ Đã xóa",
};
