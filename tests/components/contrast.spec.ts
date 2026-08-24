/// <reference types="vite/client" />

import { afterEach, describe, expect, it } from 'vitest'
import tokenStylesheet from '../../src/styles/tokens.css?raw'

type Rgb = readonly [number, number, number]
type Rgba = readonly [number, number, number, number]

const injectedStyles: HTMLStyleElement[] = []

function injectStylesheet(stylesheet: string) {
  const style = document.createElement('style')
  style.textContent = stylesheet
  document.head.append(style)
  injectedStyles.push(style)
}

function parseColor(color: string): Rgb {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (hex) return [Number.parseInt(hex[1], 16), Number.parseInt(hex[2], 16), Number.parseInt(hex[3], 16)]

  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]

  throw new Error(`Unsupported computed color: ${color}`)
}

function parseColorWithAlpha(color: string): Rgba {
  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (hex) {
    return [
      Number.parseInt(hex[1], 16),
      Number.parseInt(hex[2], 16),
      Number.parseInt(hex[3], 16),
      1,
    ]
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]

  throw new Error(`Unsupported computed color with alpha: ${color}`)
}

function relativeLuminance(color: Rgb): number {
  const channels = color.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseColor(foreground))
  const backgroundLuminance = relativeLuminance(parseColor(background))
  const lightest = Math.max(foregroundLuminance, backgroundLuminance)
  const darkest = Math.min(foregroundLuminance, backgroundLuminance)

  return (lightest + 0.05) / (darkest + 0.05)
}

function compositedContrastRatio(foreground: string, background: string): number {
  const [foregroundRed, foregroundGreen, foregroundBlue, alpha] = parseColorWithAlpha(foreground)
  const [backgroundRed, backgroundGreen, backgroundBlue] = parseColor(background)
  const composite: Rgb = [
    foregroundRed * alpha + backgroundRed * (1 - alpha),
    foregroundGreen * alpha + backgroundGreen * (1 - alpha),
    foregroundBlue * alpha + backgroundBlue * (1 - alpha),
  ]
  const foregroundLuminance = relativeLuminance(composite)
  const backgroundLuminance = relativeLuminance([backgroundRed, backgroundGreen, backgroundBlue])
  const lightest = Math.max(foregroundLuminance, backgroundLuminance)
  const darkest = Math.min(foregroundLuminance, backgroundLuminance)

  return (lightest + 0.05) / (darkest + 0.05)
}

afterEach(() => {
  for (const style of injectedStyles.splice(0)) style.remove()
})

describe('CP1 small-text contrast', () => {
  it('keeps muted 13–14px text readable on every CP1 surface', () => {
    injectStylesheet(tokenStylesheet)
    const rootStyles = getComputedStyle(document.documentElement)
    const muted = rootStyles.getPropertyValue('--text-muted').trim()

    for (const surfaceToken of ['--surface', '--surface-subtle', '--background']) {
      const surface = rootStyles.getPropertyValue(surfaceToken).trim()
      const ratio = contrastRatio(muted, surface)
      expect(ratio, `${muted} on ${surfaceToken} ${surface} rendered at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the composited focus ring visible on every CP1 surface', () => {
    injectStylesheet(tokenStylesheet)
    const rootStyles = getComputedStyle(document.documentElement)
    const focusRing = rootStyles.getPropertyValue('--focus-ring').trim()

    for (const surfaceToken of ['--surface', '--surface-subtle', '--background']) {
      const surface = rootStyles.getPropertyValue(surfaceToken).trim()
      const ratio = compositedContrastRatio(focusRing, surface)
      expect.soft(
        ratio,
        `${focusRing} composited on ${surfaceToken} ${surface} rendered at ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3)
    }
  })
})
