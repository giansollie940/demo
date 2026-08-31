export const AVATAR_MAX_BYTES: number
export const AVATAR_OUTPUT_SIZE: number
export const AVATAR_SUPPORTED_TYPES: readonly string[]

export type AvatarValidationResult = { ok: true } | { ok: false; message: string }
export interface AvatarTransformInput {
  naturalWidth: number
  naturalHeight: number
  viewportSize: number
  zoom?: number
  panX?: number
  panY?: number
}
export interface AvatarTransform {
  scale: number
  zoom: number
  panX: number
  panY: number
  renderedWidth: number
  renderedHeight: number
  maxPanX: number
  maxPanY: number
}
export interface AvatarSourceRect {
  sx: number
  sy: number
  sWidth: number
  sHeight: number
}

export function validateAvatarFile(file: { type?: string; size?: number } | null | undefined): AvatarValidationResult
export function normalizeAvatarTransform(input: AvatarTransformInput): AvatarTransform
export function avatarSourceRect(input: AvatarTransformInput): AvatarSourceRect
