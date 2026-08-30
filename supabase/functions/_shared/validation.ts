export function validUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ""));
}

export function clean(value: unknown, max = 300) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeCode(value: unknown) {
  return clean(value, 32).toUpperCase();
}

export function assertLoginCode(value: unknown) {
  const code = normalizeCode(value);
  if (!/^[A-Z0-9._-]{2,32}$/.test(code)) {
    throw Object.assign(new Error("Mã đăng nhập không hợp lệ"), {
      status: 400,
      code: "INVALID_LOGIN_CODE",
    });
  }
  return code;
}

export function assertPassword(
  value: unknown,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) {
  const password = String(value || "");
  if (allowEmpty && !password) return password;

  if (
    password.length < 8 ||
    !/\p{L}/u.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw Object.assign(
      new Error("Mật khẩu cần ít nhất 8 ký tự và có cả chữ lẫn số"),
      { status: 400, code: "WEAK_PASSWORD" },
    );
  }

  return password;
}

export function assertUuid(value: unknown, label = "ID") {
  if (!validUuid(value)) {
    throw Object.assign(new Error(`${label} không hợp lệ`), {
      status: 400,
      code: "INVALID_ID",
    });
  }
  return String(value);
}
