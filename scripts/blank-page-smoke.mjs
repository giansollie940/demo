import { chromium } from '@playwright/test'

const url = process.env.SMOKE_URL || 'http://127.0.0.1:4173/'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const consoleMessages = []
const pageErrors = []
const failedRequests = []

page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }))
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)))
page.on('requestfailed', request => failedRequests.push({
  url: request.url(),
  failure: request.failure()?.errorText || 'unknown',
}))

let response = null
try {
  response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
} catch (error) {
  pageErrors.push(String(error?.stack || error))
}

const app = page.locator('#app')
const appExists = await app.count() > 0
const appHtml = appExists ? await app.innerHTML() : ''
const bodyText = await page.locator('body').innerText().catch(() => '')
const loginVisible = await page.locator('.login-shell').count() > 0

const report = {
  url: page.url(),
  status: response?.status() ?? null,
  title: await page.title(),
  appExists,
  appHtmlLength: appHtml.length,
  bodyText: bodyText.slice(0, 1000),
  loginVisible,
  consoleMessages,
  pageErrors,
  failedRequests,
}

console.log(JSON.stringify(report, null, 2))
await page.screenshot({ path: 'blank-page-smoke.png', fullPage: true })

await browser.close()

if (!response || response.status() >= 400 || !appExists || appHtml.trim().length === 0 || !loginVisible || pageErrors.length > 0) {
  process.exit(1)
}
