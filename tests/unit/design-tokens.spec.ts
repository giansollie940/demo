/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'
import globalStylesheet from '../../src/styles/global.css?raw'
import resetStylesheet from '../../src/styles/reset.css?raw'
import tokenStylesheet from '../../src/styles/tokens.css?raw'

function injectStylesheet(stylesheet: string) {
  const style = document.createElement('style')
  style.textContent = stylesheet
  document.head.append(style)
}

function loadTokenStylesheet() {
  injectStylesheet(tokenStylesheet)

  return getComputedStyle(document.documentElement)
}

describe('design tokens', () => {
  it('exposes the learning UI primitives as computed root custom properties', () => {
    const styles = loadTokenStylesheet()

    const expectedTokens = {
      '--color-primary': '#6d5dfc',
      '--color-success': '#1f9d68',
      '--color-warning': '#d9822b',
      '--color-danger': '#d64545',
      '--surface': '#ffffff',
      '--background': '#f7f8fc',
      '--radius-card': '18px',
      '--space-4': '16px',
      '--motion-fast': '180ms',
    }

    for (const [token, value] of Object.entries(expectedTokens)) {
      expect(styles.getPropertyValue(token).trim()).toBe(value)
    }
  })

  it('provides stable body defaults through the global stylesheet', () => {
    injectStylesheet(tokenStylesheet)
    injectStylesheet(resetStylesheet)
    injectStylesheet(globalStylesheet)

    const bodyStyles = getComputedStyle(document.body)

    expect(bodyStyles.margin).toBe('0px')
    expect(bodyStyles.minWidth).toBe('320px')
    expect(bodyStyles.lineHeight).toBe('1.5')
  })
})
