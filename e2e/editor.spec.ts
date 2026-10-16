import { expect, test, type Page } from '@playwright/test'

// End-to-end editing: first run → build a small family → undo → persists across reload.

// Each person's accessible label starts with their name ("Leo" or "Leo, age 10").
const personNamed = (page: Page, name: string) =>
  page.locator(`g.person[aria-label="${name}"], g.person[aria-label^="${name},"]`)
const panel = (page: Page) => page.locator('aside.panel')

async function select(page: Page, isMobile: boolean, name: string) {
  // On phones the sheet can cover people lower down; close it first, as a user would.
  const close = page.getByRole('button', { name: 'Close panel' })
  if (await close.isVisible()) await close.click()
  // If they're scrolled off screen, fit the diagram first (a user would pan).
  const canvas = (await page.locator('svg[role="application"]').boundingBox())!
  const sym = (await personNamed(page, name).locator('.symbol').boundingBox())!
  const inside = sym.y > canvas.y && sym.y + sym.height < canvas.y + canvas.height && sym.x > canvas.x && sym.x + sym.width < canvas.x + canvas.width
  if (!inside) await page.getByRole('button', { name: 'Fit to screen' }).click()
  const b = (await personNamed(page, name).locator('.symbol').boundingBox())!
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2]
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(panel(page).locator('h2')).toHaveText(name)
}

async function addRelative(page: Page, action: string, fill: (form: ReturnType<Page['locator']>) => Promise<void>) {
  await panel(page).getByRole('button', { name: `+ ${action}` }).click()
  const form = panel(page).locator('form')
  await fill(form)
  await form.getByRole('button', { name: 'Add', exact: true }).click()
}

test('build a family from scratch', async ({ page, isMobile }) => {
  await page.goto('./')

  // First run goes straight to "Who's the client?"
  await expect(page.getByRole('heading', { name: 'Who’s the client?' })).toBeVisible()
  await page.getByLabel('Name').fill('Alex')
  await page.getByRole('button', { name: 'Male', exact: true }).click()
  await page.getByLabel('Age').fill('38')
  await page.getByLabel('Diagram title').fill('Client A')
  await page.getByRole('button', { name: 'Start genogram' }).click()
  await expect(personNamed(page, 'Alex')).toBeVisible()
  await expect(personNamed(page, 'Alex').locator('.index-ring')).toHaveCount(1)

  // Parents (both at once)
  await select(page, isMobile, 'Alex')
  await addRelative(page, 'Parents', async form => {
    await form.getByLabel('Name').nth(0).fill('Richard')
    await form.getByLabel('Name').nth(1).fill('Carol')
  })
  await expect(personNamed(page, 'Richard')).toBeVisible()
  await expect(panel(page).locator('h2')).toHaveText('Richard') // new person is selected

  // Partner + child
  await select(page, isMobile, 'Alex')
  await addRelative(page, 'Partner', async form => {
    await form.getByLabel('Name').fill('Jordan')
  })
  await select(page, isMobile, 'Alex')
  await addRelative(page, 'Child', async form => {
    await form.getByLabel('Name').fill('Leo')
    await expect(form.getByLabel('Other parent')).toHaveValue(/p\d+/) // Jordan preselected
  })
  await expect(personNamed(page, 'Leo')).toBeVisible()
  await expect(page.locator('g.person')).toHaveCount(5)

  // Edit details live
  await select(page, isMobile, 'Leo')
  await panel(page).getByLabel('Age').fill('10')
  const leoAge = personNamed(page, 'Leo').locator('tspan.age')
  await expect(leoAge).toHaveText('10')

  // Undo the age edit and the child
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(leoAge).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('g.person')).toHaveCount(4)
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.locator('g.person')).toHaveCount(5)

  // The primary subject can't be removed; others can.
  await select(page, isMobile, 'Alex')
  await expect(panel(page).getByRole('button', { name: 'Remove person' })).toHaveCount(0)

  // Saved on the device: reload and reopen from the list.
  await expect.poll(() => page.evaluate(() => document.title)).toBeTruthy()
  await page.waitForTimeout(800) // autosave debounce
  await page.goto('./')
  const doc = page.getByRole('link', { name: /Client A/ })
  await expect(doc).toContainText('5 people')
  await doc.click()
  await expect(page.locator('g.person')).toHaveCount(5)
  await expect(page.getByLabel('Diagram title')).toHaveValue('Client A')
})

test('a partnership can be edited from its line', async ({ page, isMobile }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Try a sample family' }).click()
  const line = page.locator('[data-kind="partnership"][data-id="u4"] path.line').first() // Alex & Jordan
  const box = (await line.boundingBox())!
  const [x, y] = [box.x + box.width / 2 - 10, box.y + box.height - 1]
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(panel(page).locator('h2')).toContainText('Alex & Jordan')
  await panel(page).getByLabel('Status').selectOption('separated')
  // One slash appears on the line.
  await expect(page.locator('[data-kind="partnership"][data-id="u4"] path.line').nth(1)).toHaveAttribute('d', /^M/)
})

test('importing a bad file shows an error and keeps you on the list', async ({ page }) => {
  await page.goto('./')
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ "nope": true }'),
  })
  await expect(page.getByRole('alert')).toContainText('Couldn’t open “broken.json”')
  await expect(page.getByRole('heading', { name: 'Who’s the client?' })).toBeVisible()
})
