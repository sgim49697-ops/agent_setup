// journey.spec.ts - UX Benchmark v2 journey-first validation
// This suite is intentionally opt-in until the harnesses are upgraded for v2.
import { test, expect } from '@playwright/test'

const enabled = process.env.ENABLE_V2_JOURNEY === '1'

test.describe('v2 journey contract', () => {
  test.skip(!enabled, 'Journey tests are opt-in until the v2 harness contract is implemented.')

  async function fillBrief(page: import('@playwright/test').Page) {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Topic' }).fill('LangGraph 1.0에서 Supervisor 패턴 설계하기')
    await page.getByLabel('Audience').selectOption('practitioner')
    await page.getByLabel('Tone').selectOption('pragmatic')
    await page.getByLabel('Length').selectOption('medium')
  }

  async function expectStepVisible(
    page: import('@playwright/test').Page,
    candidates: RegExp[],
    timeout = 15_000,
  ) {
    for (const pattern of candidates) {
      const locator = page.getByText(pattern).first()
      if (await locator.isVisible().catch(() => false)) {
        await expect(locator).toBeVisible({ timeout })
        return
      }
    }

    await expect(page.getByText(candidates[0]).first()).toBeVisible({ timeout })
  }

  test('journey: brief -> research -> outline -> draft/review -> final progression is visible', async ({
    page,
  }) => {
    await fillBrief(page)

    await page.getByRole('button', { name: /generate post/i }).click()

    await expectStepVisible(page, [/research/i, /research results/i])
    await expectStepVisible(page, [/outline/i])
    await expectStepVisible(page, [/draft/i, /section drafts/i])
    await expectStepVisible(page, [/review/i, /review notes/i])
    await expectStepVisible(page, [/final/i, /final post/i])
  })

  test('journey: final/export state exposes copy action after progression', async ({ page }) => {
    await fillBrief(page)
    await page.getByRole('button', { name: /generate post/i }).click()

    await expect(page.getByRole('button', { name: /copy markdown/i })).toBeVisible({
      timeout: 15_000,
    })
    await expectStepVisible(page, [/final/i, /final post/i])
  })

  test('journey: error path remains recoverable', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Topic' }).fill('fail this topic intentionally')
    await page.getByRole('button', { name: /generate post/i }).click()

    const errorIndicator = page
      .locator('[role="alert"], .error-panel, .error-state, [class*="error"]')
      .first()
    await expect(errorIndicator).toBeVisible({ timeout: 5_000 })

    await page.getByRole('textbox', { name: 'Topic' }).fill('LangGraph 1.0에서 Supervisor 패턴 설계하기')
    await page.getByRole('button', { name: /generate post/i }).click()
    await expectStepVisible(page, [/research/i, /research results/i])
  })
})
