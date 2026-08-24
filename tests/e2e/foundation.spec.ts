import { expect, test } from '@playwright/test'

type Rgb = readonly [number, number, number]

function parseRgb(color: string): Rgb {
  const match = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])]

  const colorSrgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i)
  if (colorSrgb) {
    return [Number(colorSrgb[1]) * 255, Number(colorSrgb[2]) * 255, Number(colorSrgb[3]) * 255]
  }

  throw new Error(`Chromium returned an unsupported color: ${color}`)
}

function relativeLuminance(color: Rgb): number {
  const channels = color.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground))
  const backgroundLuminance = relativeLuminance(parseRgb(background))
  const lightest = Math.max(foregroundLuminance, backgroundLuminance)
  const darkest = Math.min(foregroundLuminance, backgroundLuminance)

  return (lightest + 0.05) / (darkest + 0.05)
}

test('foundation shell works across route changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/#/dashboard')

  await expect(page).toHaveTitle(/Sổ Tự Học/)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.png/)

  const icons = page.locator('[data-nav-icon]')
  await expect(icons.first()).toBeVisible()
  expect(await icons.count()).toBeGreaterThan(5)

  await page.getByRole('button', { name: /thu gọn|mở rộng|menu/i }).first().click()
  await expect(page.locator('[data-app-shell]')).toHaveAttribute('data-sidebar-collapsed', 'true')

  await page.getByRole('link', { name: /weeks/i }).click()
  await expect(page).toHaveURL(/#\/weeks/)
  await expect(page.locator('[data-nav-surface="desktop"] [data-nav-item].is-active')).toContainText(/Weeks/i)

  await page.goto('/#/dashboard')
  const badgeColors = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('.app-badge--warning')
    if (!source) throw new Error('Rendered warning badge was not found')

    return ['success', 'warning', 'danger'].map((tone) => {
      const badge = source.cloneNode(true) as HTMLElement
      badge.classList.remove('app-badge--warning')
      badge.classList.add(`app-badge--${tone}`)
      badge.textContent = tone
      badge.style.position = 'fixed'
      badge.style.insetInlineStart = '-10000px'
      document.body.append(badge)

      const styles = getComputedStyle(badge)
      const result = { tone, foreground: styles.color, background: styles.backgroundColor }
      badge.remove()
      return result
    })
  })

  for (const { tone, foreground, background } of badgeColors) {
    const ratio = contrastRatio(foreground, background)
    expect.soft(ratio, `${tone} badge rendered ${foreground} on ${background} at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  }
})

test('dashboard stays usable without horizontal overflow at supported viewport widths', async ({ page }) => {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/#/dashboard')

    await expect(page.locator('[data-section="hero"]')).toBeVisible()
    await expect(page.getByRole('main', { name: /bảng điều khiển tổng quan/i })).toBeVisible()

    const documentWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth)
  }
})

test('dashboard hero fits the 1280 by 800 fold', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/#/dashboard')

  const selectors = [
    '[data-section="hero"]',
    '.page-header__eyebrow',
    '.page-header__title',
    '.page-header__description',
    '.dashboard-hero__note',
    '.dashboard-hero__visual img',
  ]

  for (const selector of selectors) {
    const element = page.locator(selector)
    await expect(element).toBeVisible()
    const box = await element.boundingBox()
    expect(box, `${selector} has a rendered box`).not.toBeNull()
    expect(box!.y, `${selector} starts inside the viewport`).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height, `${selector} fits above the 800px fold`).toBeLessThanOrEqual(800)
  }

  const heroPadding = await page.locator('[data-section="hero"]').evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      blockStart: Number.parseFloat(styles.paddingBlockStart),
      blockEnd: Number.parseFloat(styles.paddingBlockEnd),
    }
  })
  expect(heroPadding.blockEnd).toBeGreaterThanOrEqual(heroPadding.blockStart * 1.3)
})

test('Hallmark layout and motion gates hold in rendered Chromium', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/#/weeks')

  const placeholderStyles = await page.evaluate(() => ({
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    titleOverflowWrap: getComputedStyle(document.querySelector('.page-header__title')!).overflowWrap,
  }))
  expect.soft(placeholderStyles.htmlOverflowX).toBe('clip')
  expect.soft(placeholderStyles.bodyOverflowX).toBe('clip')
  expect.soft(placeholderStyles.titleOverflowWrap).toBe('anywhere')

  await page.goto('/#/dashboard')
  await expect(page.locator('.attention-list__marker').first()).toBeVisible()
  expect.soft(await page.locator('.attention-list__marker').first().evaluate((element) => getComputedStyle(element).marginTop)).toBe('8px')

  await page.setViewportSize({ width: 1280, height: 900 })
  const toggle = page.locator('[data-desktop-sidebar-toggle]')
  const toggleBox = await toggle.boundingBox()
  if (!toggleBox) throw new Error('Desktop sidebar toggle has no rendered box')
  await page.mouse.move(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2)
  await page.mouse.down()
  expect.soft(await toggle.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none')
  await page.mouse.up()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const activeLink = page.locator('[data-nav-surface="desktop"] [data-nav-item].is-active')
  const activeLinkBox = await activeLink.boundingBox()
  if (!activeLinkBox) throw new Error('Active desktop navigation link has no rendered box')
  await page.mouse.move(
    activeLinkBox.x + activeLinkBox.width / 2,
    activeLinkBox.y + activeLinkBox.height / 2,
  )
  await page.mouse.down()
  expect.soft(await activeLink.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
  await page.mouse.up()
})

test('reduced motion disables sidebar icon spatial transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/#/dashboard')

  const transitionDuration = await page.locator('[data-nav-icon]').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  )
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.01)
})
