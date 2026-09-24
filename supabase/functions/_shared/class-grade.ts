// FEAT-004 canonical grade input. Naming conventions are intentionally irrelevant.
export function requireClassGrade(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 6 || value > 12) {
    throw Object.assign(new Error("Chọn khối từ 6 đến 12"), {status: 400, code: "INVALID_GRADE"});
  }
  return value;
}
export function rejectGradeEdit(body: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(body, "grade")) {
    throw Object.assign(new Error("Đổi khối cần task riêng"), {status: 400, code: "GRADE_IMMUTABLE"});
  }
}
