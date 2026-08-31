export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_OUTPUT_SIZE = 512
export const AVATAR_SUPPORTED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp'])

export function validateAvatarFile(file) {
  const type = String(file?.type || '').toLowerCase()
  const size = Number(file?.size || 0)
  if (!AVATAR_SUPPORTED_TYPES.includes(type)) {
    return { ok: false, message: 'Chỉ hỗ trợ JPG, PNG hoặc WEBP.' }
  }
  if (!Number.isFinite(size) || size <= 0 || size > AVATAR_MAX_BYTES) {
    return { ok: false, message: 'Ảnh đại diện tối đa 5 MB.' }
  }
  return { ok: true }
}

function finitePositive(value, fallback = 1) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeAvatarTransform(input) {
  const naturalWidth = finitePositive(input?.naturalWidth)
  const naturalHeight = finitePositive(input?.naturalHeight)
  const viewportSize = finitePositive(input?.viewportSize, 300)
  const zoom = clamp(finitePositive(input?.zoom), 1, 3)
  const baseScale = Math.max(viewportSize / naturalWidth, viewportSize / naturalHeight)
  const scale = baseScale * zoom
  const renderedWidth = naturalWidth * scale
  const renderedHeight = naturalHeight * scale
  const maxPanX = Math.max(0, (renderedWidth - viewportSize) / 2)
  const maxPanY = Math.max(0, (renderedHeight - viewportSize) / 2)
  const panX = maxPanX === 0 ? 0 : clamp(Number(input?.panX) || 0, -maxPanX, maxPanX)
  const panY = maxPanY === 0 ? 0 : clamp(Number(input?.panY) || 0, -maxPanY, maxPanY)
  return { scale, zoom, panX, panY, renderedWidth, renderedHeight, maxPanX, maxPanY }
}

export function avatarSourceRect(input) {
  const naturalWidth = finitePositive(input?.naturalWidth)
  const naturalHeight = finitePositive(input?.naturalHeight)
  const viewportSize = finitePositive(input?.viewportSize, 300)
  const transform = normalizeAvatarTransform({ ...input, naturalWidth, naturalHeight, viewportSize })
  const sWidth = viewportSize / transform.scale
  const sHeight = viewportSize / transform.scale
  const sx = clamp(
    naturalWidth / 2 - sWidth / 2 - transform.panX / transform.scale,
    0,
    Math.max(0, naturalWidth - sWidth),
  )
  const sy = clamp(
    naturalHeight / 2 - sHeight / 2 - transform.panY / transform.scale,
    0,
    Math.max(0, naturalHeight - sHeight),
  )
  return { sx, sy, sWidth, sHeight }
}
