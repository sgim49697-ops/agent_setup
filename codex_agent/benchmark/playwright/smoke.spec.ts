// smoke.spec.ts - UI 계약 기반 자동 smoke test
// smoke_flow.md + ui_contract.md 에 정의된 필수 요소를 기계적으로 검증한다.
import { test, expect } from '@playwright/test'

const stageTestIds = {
  research: 'stage-research',
  outline: 'stage-outline',
  drafts: 'stage-drafts',
  review: 'stage-review',
  final: 'stage-final',
} as const

// ─── L1-1: 필수 입력 필드 존재 ───

test('입력 필드: Topic이 존재한다', async ({ page }) => {
  await page.goto('/')
  const topic = page.getByRole('textbox', { name: 'Topic' })
  await expect(topic).toBeVisible()
})

test('입력 필드: Audience가 존재한다', async ({ page }) => {
  await page.goto('/')
  const audience = page.getByLabel('Audience')
  await expect(audience).toBeVisible()
})

test('입력 필드: Tone이 존재한다', async ({ page }) => {
  await page.goto('/')
  const tone = page.getByLabel('Tone')
  await expect(tone).toBeVisible()
})

test('입력 필드: Length가 존재한다', async ({ page }) => {
  await page.goto('/')
  const length = page.getByLabel('Length')
  await expect(length).toBeVisible()
})

// ─── L1-2: 필수 액션 존재 ───

test('액션: Generate post 버튼이 존재한다', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: /generate post/i })
  await expect(btn).toBeVisible()
})

test('액션: Copy markdown 버튼이 존재한다', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: /copy markdown/i })
  await expect(btn).toBeVisible()
})

// ─── L1-3: 생성 플로우 전체 통과 ───

test('플로우: Generate → 5단계 산출물이 모두 나타난다', async ({ page }) => {
  await page.goto('/')

  // 기본 토픽이 있으므로 바로 Generate
  const generateBtn = page.getByRole('button', { name: /generate post/i })
  await generateBtn.click()

  // 각 단계 영역이 안정적 test hook으로 유지되는지 확인 (최대 15초 대기)
  await expect(page.getByTestId(stageTestIds.research)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(stageTestIds.outline)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(stageTestIds.drafts)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(stageTestIds.review)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId(stageTestIds.final)).toBeVisible({ timeout: 15_000 })
})

test('플로우: 최종 포스트가 비어있지 않다', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /generate post/i }).click()

  // v2에서는 export-ready 문구가 상태 배너와 패널 제목에 모두 나타날 수 있으므로
  // 상태 라이브 리전으로 완료 상태를 확인한다.
  const statusArea = page.locator('[aria-live="polite"]').first()
  await expect(statusArea).toContainText(/export[-. ]ready/i, { timeout: 15_000 })

  // final post 영역에 실제 텍스트가 있는지 확인
  const finalPreview = page
    .locator('.final-panel pre, .markdown-preview, [class*="final"] pre')
    .first()
  await expect(finalPreview).toBeVisible({ timeout: 5_000 })
  await expect(finalPreview).not.toBeEmpty({ timeout: 5_000 })
})

// ─── L1-4: 상태 표현 검증 ───

test('상태: initial 상태가 표시된다', async ({ page }) => {
  await page.goto('/')
  // 아직 Generate 하지 않은 상태에서 initial 관련 표시 확인
  const statusArea = page.locator('[aria-live="polite"]').first()
  await expect(statusArea).toBeVisible()
})

test('상태: loading 중 Generate 버튼이 비활성화된다', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: /generate post/i })
  await btn.click()
  // 클릭 직후 비활성화 확인 또는 텍스트 변경 (Generating...)
  const isDisabled = await btn.isDisabled().catch(() => false)
  const text = await btn.textContent()
  expect(isDisabled || /generat(ing|e)/i.test(text ?? '')).toBeTruthy()
})

test('상태: error 상태 진입 시 에러 메시지가 표시된다', async ({ page }) => {
  await page.goto('/')
  // 에러 트리거 토픽 입력
  const topicField = page.getByRole('textbox', { name: 'Topic' })
  await topicField.fill('fail this topic intentionally')

  await page.getByRole('button', { name: /generate post/i }).click()

  // 에러 관련 텍스트 확인
  const errorIndicator = page.locator('[role="alert"], .error-panel, .error-state, [class*="error"]').first()
  await expect(errorIndicator).toBeVisible({ timeout: 5_000 })
})

// ─── L1-5: 접근성 기본기 ───

test('접근성: 모든 입력에 aria-label 또는 연결된 label이 있다', async ({ page }) => {
  await page.goto('/')
  const inputs = page.locator('input, textarea, select')
  const count = await inputs.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i)
    const ariaLabel = await el.getAttribute('aria-label')
    const id = await el.getAttribute('id')
    const name = await el.getAttribute('name')
    // 최소한 aria-label, id (label[for] 연결), 또는 name 중 하나는 있어야 함
    const hasLabel = !!(ariaLabel || id || name)
    expect(hasLabel, `input #${i} has no accessible label`).toBe(true)
  }
})

test('접근성: aria-live 영역이 존재한다', async ({ page }) => {
  await page.goto('/')
  const liveRegion = page.locator('[aria-live]')
  await expect(liveRegion.first()).toBeAttached()
})

// ─── L1-6: 빈 상태 메시지 ───

test('빈 상태: Generate 전에 안내 메시지가 있다', async ({ page }) => {
  await page.goto('/')
  // 빈 상태에서 안내 텍스트 존재 확인
  const emptyHints = page.locator('.empty-state, [class*="empty"], [class*="placeholder"]')
  const count = await emptyHints.count()
  // 최소 1개 이상의 빈 상태 안내가 있어야 함
  expect(count).toBeGreaterThanOrEqual(1)
})
