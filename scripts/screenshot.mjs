// Captures dashboard screenshots for the README (used by the e2e CI job).
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://localhost:3000'
const out = process.env.OUT_DIR || 'screenshots'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(base)
await page.waitForSelector('.machine-card')
await page.waitForTimeout(4000)
await page.screenshot({ path: `${out}/dashboard.png`, fullPage: true })

await page.getByRole('button', { name: 'What should I check for this fault?' }).click()
await page.waitForSelector('.msg-assistant:not(.typing)', { timeout: 60000 })
await page.waitForTimeout(500)
await page.locator('.assistant').screenshot({ path: `${out}/assistant.png` })

await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/mobile.png` })
await browser.close()
console.log('Screenshots saved to', out)
