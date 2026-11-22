// Captures Jam helper screenshots for the README.
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'http://localhost:3000'
const out = process.env.OUT_DIR || 'screenshots'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto(base)
await page.getByRole('button', { name: /FlowMaster/ }).click()
await page.getByRole('button', { name: /Front table jam/ }).click()
await page.screenshot({ path: `${out}/jam-helper.png`, fullPage: true })
await browser.close()
console.log('Screenshots saved to', out)
