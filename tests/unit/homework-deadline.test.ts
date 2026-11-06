import { describe, expect, it } from "vitest";
import { checkDeadline, deadlineMs, isDueInPastError, SOON_MS } from "../../src/features/homework/deadline";

// 2026-11-06 14:05 giờ Việt Nam = 07:05Z
const NOW = Date.parse("2026-11-06T07:05:00Z");

describe("checkDeadline — cùng luật với máy chủ", () => {
  it("đọc ô datetime-local theo giờ Việt Nam", () => {
    expect(deadlineMs("2026-11-06T14:05")).toBe(NOW);
    expect(Number.isNaN(deadlineMs(""))).toBe(true);
    expect(Number.isNaN(deadlineMs("06/11/2026"))).toBe(true);
  });

  it("chặn hạn đã qua, ghi giờ Việt Nam trong câu báo", () => {
    const r = checkDeadline("2026-11-05T08:30", "", NOW);
    expect(r.level).toBe("block");
    expect(r.message).toContain("08:30");
    expect(r.message).toContain("05/11/2026");
    expect(r.message).toContain("14:05");
  });

  it("biên: hạn đúng bằng thời điểm đăng cũng bị chặn", () => {
    expect(checkDeadline("2026-11-06T14:05", "", NOW).level).toBe("block");
  });

  it("hạn còn dưới 1 giờ chỉ cảnh báo, từ 1 giờ trở lên thì không", () => {
    const soon = checkDeadline("2026-11-06T14:35", "", NOW);
    expect(soon.level).toBe("warn");
    expect(soon.message).toContain("30 phút");
    expect(checkDeadline("2026-11-06T15:05", "", NOW).level).toBe("ok");
    expect(SOON_MS).toBe(3600000);
  });

  it("sửa bài mà giữ nguyên hạn đã qua thì không chặn; đổi sang hạn đã qua khác thì chặn", () => {
    const original = "2026-11-01T01:30:00Z"; // 08:30 01/11 giờ Việt Nam
    expect(checkDeadline("2026-11-01T08:30", original, NOW).level).toBe("ok");
    expect(checkDeadline("2026-11-02T08:30", original, NOW).level).toBe("block");
    expect(checkDeadline("2026-11-08T08:30", original, NOW).level).toBe("ok");
  });

  it("ô trống thì để thuộc tính required của form lo", () => {
    expect(checkDeadline("", "", NOW).level).toBe("ok");
  });

  it("nhận ra lỗi hạn đã qua từ máy chủ qua code hoặc hint", () => {
    expect(isDueInPastError(Object.assign(new Error("x"), { code: "HOMEWORK_DUE_IN_PAST" }))).toBe(true);
    expect(isDueInPastError(Object.assign(new Error("x"), { code: "22023", hint: "HOMEWORK_DUE_IN_PAST" }))).toBe(true);
    expect(isDueInPastError(new Error("Môn không hoạt động"))).toBe(false);
    expect(isDueInPastError(null)).toBe(false);
  });
});
