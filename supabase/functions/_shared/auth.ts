export type ActorProfile = {
  id: string;
  role: "admin" | "teacher" | "student" | "monitor";
  active: boolean;
  class_id: string | null;
  full_name?: string | null;
  student_code?: string | null;
};

function authError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

export async function requireActor(req: Request, admin: any): Promise<ActorProfile> {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    throw authError("Thiếu phiên đăng nhập", 401, "NO_SESSION");
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw authError("Phiên đăng nhập không hợp lệ", 401, "INVALID_SESSION");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,active,class_id,full_name,student_code")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile?.active) {
    throw authError(
      "Tài khoản đã bị khóa hoặc không tồn tại",
      403,
      "INACTIVE_PROFILE",
    );
  }

  return profile as ActorProfile;
}

export function requireManager(actor: ActorProfile) {
  if (!["admin", "teacher"].includes(actor.role)) {
    throw authError(
      "Bạn không có quyền quản lý dữ liệu lớp",
      403,
      "MANAGER_REQUIRED",
    );
  }
}

export function requireRootAdmin(actor: ActorProfile) {
  if (actor.role !== "admin") {
    throw authError(
      "Chỉ quản trị viên gốc được thực hiện thao tác này",
      403,
      "ROOT_ADMIN_REQUIRED",
    );
  }
}
