import { reactive } from 'vue'

// Hộp thoại xác nhận/nhập liệu dùng chung cho cả app, thay cho window.confirm()
// và window.prompt() của trình duyệt. Lý do bỏ popup trình duyệt:
//   - Giao diện lạc lõng (font/nút của hệ điều hành), không theo theme sáng/tối.
//   - window.prompt() chỉ có một dòng input trần, không có nhãn, gợi ý, chỗ báo
//     lỗi, không nhập được nhiều dòng cho nhận xét của GV.
//   - Popup trình duyệt khoá toàn bộ luồng JS, và nhiều trình duyệt cho phép
//     người dùng chặn vĩnh viễn ("không hiện hộp thoại nữa") — khi đó thao tác
//     im lặng không chạy mà không báo gì.
//
// Dùng ở bất kỳ đâu (kể cả router guard, ngoài component):
//   if (!(await appDialog.confirm({ body: 'Xóa đăng ký này?' }))) return
//   const note = await appDialog.prompt({ label: 'Nhận xét giáo viên' })
//   if (note === null) return   // null = người dùng bấm Hủy

export interface ConfirmRequest {
  title?: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface PromptRequest extends ConfirmRequest {
  /** Nhãn hiện phía trên ô nhập. */
  label?: string
  placeholder?: string
  /** Giá trị điền sẵn (ví dụ nhận xét cũ của GV để sửa tiếp). */
  initialValue?: string
  /** true = textarea nhiều dòng (nhận xét), false = input một dòng. */
  multiline?: boolean
  /** Bắt buộc nhập; để trống thì nút xác nhận bị khoá. */
  required?: boolean
  /** Trả về chuỗi lỗi nếu giá trị chưa hợp lệ, hoặc null nếu hợp lệ. */
  validate?: (value: string) => string | null
}

interface DialogState {
  open: boolean
  mode: 'confirm' | 'prompt'
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  label: string
  placeholder: string
  value: string
  multiline: boolean
  required: boolean
  error: string
}

const CLOSED: DialogState = {
  open: false,
  mode: 'confirm',
  title: 'Xác nhận thao tác',
  body: '',
  confirmLabel: 'Xác nhận',
  cancelLabel: 'Hủy',
  danger: false,
  label: '',
  placeholder: '',
  value: '',
  multiline: false,
  required: true,
  error: '',
}

export function createAppDialog() {
  const state = reactive<DialogState>({ ...CLOSED })
  // cancelValue được ghi kèm để khi hộp thoại bị hủy (bấm Hủy, Esc, hoặc bị một
  // hộp thoại khác chiếm chỗ) thì Promise được trả đúng kiểu của chính nó:
  // confirm -> false, prompt -> null.
  let pending: { resolve: (value: string | boolean | null) => void; cancelValue: boolean | null } | null = null
  let validator: PromptRequest['validate'] = undefined

  // Một hộp thoại tại một thời điểm. Nếu có yêu cầu mới khi hộp cũ còn mở
  // (ví dụ người dùng bấm nhanh hai nút), hộp cũ được coi như bị hủy để không
  // có Promise nào bị treo mãi mãi.
  function resolvePending(value?: string | boolean | null) {
    const current = pending
    pending = null
    validator = undefined
    if (current) current.resolve(value === undefined ? current.cancelValue : value)
  }

  function open(
    request: PromptRequest,
    mode: 'confirm' | 'prompt',
    resolve: (value: string | boolean | null) => void,
  ) {
    // Hủy hộp cũ TRƯỚC khi ghi nhận hộp mới, nếu không chính hộp mới sẽ bị
    // resolve ngay lập tức và người dùng không kịp thấy gì.
    resolvePending()
    pending = { resolve, cancelValue: mode === 'confirm' ? false : null }
    Object.assign(state, CLOSED, {
      open: true,
      mode,
      title: request.title ?? (mode === 'prompt' ? 'Nhập thông tin' : CLOSED.title),
      body: request.body ?? '',
      confirmLabel: request.confirmLabel ?? CLOSED.confirmLabel,
      cancelLabel: request.cancelLabel ?? CLOSED.cancelLabel,
      danger: request.danger ?? false,
      label: request.label ?? '',
      placeholder: request.placeholder ?? '',
      value: request.initialValue ?? '',
      multiline: request.multiline ?? false,
      required: request.required ?? true,
      error: '',
    })
    validator = request.validate
  }

  function confirm(request: ConfirmRequest = {}): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      open(request, 'confirm', resolve as (value: string | boolean | null) => void)
    })
  }

  function prompt(request: PromptRequest = {}): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      open(request, 'prompt', resolve as (value: string | boolean | null) => void)
    })
  }

  /** Người dùng bấm nút xác nhận. Trả về false nếu giá trị chưa hợp lệ. */
  function accept(): boolean {
    if (state.mode === 'confirm') {
      state.open = false
      resolvePending(true)
      return true
    }
    const value = state.value.trim()
    if (state.required && !value) {
      state.error = 'Vui lòng nhập nội dung.'
      return false
    }
    const message = validator?.(value) ?? null
    if (message) {
      state.error = message
      return false
    }
    state.open = false
    resolvePending(value)
    return true
  }

  /** Người dùng bấm Hủy, bấm ra ngoài, hoặc nhấn Esc. */
  function cancel() {
    state.open = false
    resolvePending()
  }

  function setValue(value: string) {
    state.value = value
    if (state.error) state.error = ''
  }

  return { state, confirm, prompt, accept, cancel, setValue }
}

export type AppDialog = ReturnType<typeof createAppDialog>

export const appDialog = createAppDialog()
