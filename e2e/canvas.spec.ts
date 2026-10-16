import { expect, test, type Locator, type Page } from '@playwright/test'

// Phase 3 canvas: selection by tap/click, panning, zooming, keyboard.

const person = (page: Page, id: string) => page.locator(`g.person[data-id="${id}"]`)
const status = (page: Page) => page.locator('footer span').first()
const transform = (page: Page) => page.locator('svg[role="application"] > g').getAttribute('transform')

async function center(l: Locator) {
  const b = (await l.locator('.symbol').boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.beforeEach(async ({ page }) => {
  await page.goto('?sample=example')
  await expect(person(page, 'p1')).toBeVisible()
})

test('tapping a person selects them', async ({ page, isMobile }) => {
  const c = await center(person(page, 'p1'))
  if (isMobile) await page.touchscreen.tap(c.x, c.y)
  else await page.mouse.click(c.x, c.y)
  await expect(status(page)).toHaveText('Alex')
  await expect(person(page, 'p1')).toHaveClass(/selected/)
})

test('tapping a partner line selects the partnership', async ({ page, isMobile }) => {
  // Carol (p3) & Richard (p2): divorced. Tap the middle of the horizontal segment.
  const line = page.locator('[data-kind="partnership"][data-id="u2"] path.line').first()
  const box = (await line.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height - 1
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(status(page)).toContainText('Richard & Carol')
})

test('tapping empty space clears the selection', async ({ page }) => {
  const c = await center(person(page, 'p1'))
  await page.mouse.click(c.x, c.y)
  await expect(status(page)).toHaveText('Alex')
  const svg = (await page.locator('svg[role="application"]').boundingBox())!
  await page.mouse.click(svg.x + 5, svg.y + 5)
  await expect(status(page)).toHaveText('Tap a person or line')
})

test('dragging pans without selecting', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag; touch pan is covered by pointer events in the same handler')
  const before = await transform(page)
  const c = await center(person(page, 'p1'))
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 5 })
  await page.mouse.up()
  expect(await transform(page)).not.toBe(before)
  await expect(status(page)).toHaveText('Tap a person or line')
})

test('zoom buttons and ctrl+wheel change the scale; fit restores it', async ({ page, isMobile }) => {
  const scale = async () => Number((await transform(page))!.match(/scale\(([\d.]+)\)/)![1])
  const fitted = await scale()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  expect(await scale()).toBeCloseTo(fitted * 1.25, 3)
  if (!isMobile) {
    const svg = (await page.locator('svg[role="application"]').boundingBox())!
    await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await expect.poll(scale).toBeGreaterThan(fitted * 1.25)
  }
  await page.getByRole('button', { name: 'Fit to screen' }).click()
  expect(await scale()).toBeCloseTo(fitted, 3)
})

test('keyboard: tab to a person and press Enter', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no keyboard on phones')
  await page.locator('svg[role="application"]').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(status(page)).not.toHaveText('Tap a person or line')
  await page.keyboard.press('Escape')
  await expect(status(page)).toHaveText('Tap a person or line')
})

test('the page never scrolls sideways on a phone', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
