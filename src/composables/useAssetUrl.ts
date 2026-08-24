/// <reference types="vite/client" />

export function assetUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || './'
  const clean = relativePath.replace(/^\/+/, '')
  return `${base}${clean}`
}

export function useAssetUrl(relativePath: string): string {
  return assetUrl(relativePath)
}
