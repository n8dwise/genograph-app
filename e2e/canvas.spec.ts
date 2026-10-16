import { expect, test, type Locator, type Page } from '@playwright/test'

// Canvas interactions on the sample family: select, pan, zoom, keyboard, drag-to-move.

const person = (page: Page, id: string) => page.locator(`g.person[data-id="${id}"]`)
const panelTitle = (page: Page) => page.locator('aside.panel h2')
const transform = (page: Page) => page.locator('svg[role="application"] > g').getAttribute('transform')

async function center(l: Locator) {
  const b = (await l.locator('.symbol').boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function tap(page: Page, isMobile: boolean, x: number, y: number) {
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample family' }).click()
  await expect(person(page, 'p1')).toBeVisible()
})

test('tapping a person opens their panel', async ({ page, isMobile }) => {
  const c = await center(person(page, 'p1'))
  await tap(page, isMobile, c.x, c.y)
  await expect(panelTitle(page)).toHaveText('Alex')
  await expect(person(page, 'p1')).toHaveClass(/selected/)
})

test('tapping a partner line opens the partnership panel', async ({ page, isMobile }) => {
  // Carol (p3) & Richard (p2): divorced. Tap the middle of the horizontal segment.
  const box = (await page.locator('[data-kind="partnership"][data-id="u2"] path.line').first().boundingBox())!
  await tap(page, isMobile, box.x + box.width / 2, box.y + box.height - 1)
  await expect(panelTitle(page)).toContainText('Richard & Carol')
  await expect(page.getByLabel('Status')).toHaveValue('divorced')
})

test('tapping empty space closes the panel', async ({ page }) => {
  const c = await center(person(page, 'p1'))
  await page.mouse.click(c.x, c.y)
  await expect(panelTitle(page)).toHaveText('Alex')
  const svg = (await page.locator('svg[role="application"]').boundingBox())!
  await page.mouse.click(svg.x + 5, svg.y + 5)
  await expect(panelTitle(page)).toHaveCount(0)
})

test('dragging empty space pans without selecting', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag')
  const before = await transform(page)
  const c = await center(person(page, 'p1'))
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 5 })
  await page.mouse.up()
  expect(await transform(page)).not.toBe(before)
  await expect(panelTitle(page)).toHaveCount(0)
})

test('dragging the selected person moves them, and undo puts them back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag')
  const c = await center(person(page, 'p1'))
  await page.mouse.click(c.x, c.y)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 60, c.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await center(person(page, 'p1'))).x).toBeGreaterThan(c.x + 30)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await center(person(page, 'p1'))).x).toBeCloseTo(c.x, 0)
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

test('keyboard: tab to a person, Enter selects, Escape clears', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no keyboard on phones')
  await page.locator('svg[role="application"]').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(panelTitle(page)).toHaveCount(1)
  await page.locator('svg[role="application"]').focus()
  await page.keyboard.press('Escape')
  await expect(panelTitle(page)).toHaveCount(0)
})

test('the page never scrolls sideways', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
