// Step 17 E2E coverage — ClientConfigPanel shell + Features tab.
// All API calls are mocked; tests run against a local Vite dev server (no CF functions needed).

import { test, expect, type Page } from '@playwright/test'

const MOCK_FEATURES = [
  { feature: 'chat',         enabled: true,  enabled_at: '2026-06-01T00:00:00Z', enabled_by: null,        config: null },
  { feature: 'public_chat',  enabled: true,  enabled_at: '2026-06-01T00:00:00Z', enabled_by: 'lukesgray', config: null },
  { feature: 'intake',       enabled: true,  enabled_at: '2026-06-01T00:00:00Z', enabled_by: 'lukesgray', config: null },
  { feature: 'reviews',      enabled: false, enabled_at: null,                    enabled_by: null,        config: null },
  { feature: 'crm_sync',     enabled: false, enabled_at: null,                    enabled_by: null,        config: null },
  { feature: 'lead_scoring', enabled: true,  enabled_at: '2026-06-15T00:00:00Z', enabled_by: 'lukesgray', config: null },
  { feature: 'advanced_ai',  enabled: false, enabled_at: null,                    enabled_by: null,        config: { cap: 100 } },
  { feature: 'sms',          enabled: false, enabled_at: null,                    enabled_by: null,        config: null },
]

async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('caiac_ops_token', 'mock-ops-token')
    sessionStorage.setItem('caiac_ops_webhook_secret', 'mock-secret')
  })
}

async function mockApis(page: Page) {
  // Catch-all for calls made by sidebar components (CollectionHealth, DocumentLibrary, etc.)
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, json: {} }))

  // App-level: client list
  await page.route('**/api/admin-clients', (r) =>
    r.fulfill({ json: { clients: [{ slug: 'henderson', name: 'Henderson & Associates' }] } })
  )

  // Components that check for specific array keys — return minimal valid shapes
  await page.route('**/api/admin-health**', (r) =>
    r.fulfill({ json: { status: 'ok', summary: { total: 5, ready: 5, indexing: 0, failed: 0 } } })
  )
  await page.route('**/api/admin-documents**', (r) => r.fulfill({ json: { documents: [] } }))
  await page.route('**/api/admin-ai-usage**', (r) => r.fulfill({ json: { clients: [] } }))
  await page.route('**/api/admin-quick-action-usage**', (r) => r.fulfill({ json: { actions: [] } }))

  // Panel: feature config + toggle
  await page.route('**/api/admin-client-config**', (r) =>
    r.fulfill({
      json: {
        slug: 'henderson',
        features: MOCK_FEATURES,
        config: { lead_capture: { notify_email: 'test@henderson.com' } },
      },
    })
  )
  await page.route('**/api/admin-toggle-feature', (r) =>
    r.fulfill({ json: { success: true } })
  )
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Open client config panel' }).click()
  // Wait for Features tab content to confirm the panel finished mounting
  await expect(page.getByText('Lead Intake')).toBeVisible()
}

// ─── Panel shell ────────────────────────────────────────────────────────────────

test.describe('ClientConfigPanel shell', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/')
  })

  test('panel opens when gear button clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Open client config panel' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('panel closes on Escape key', async ({ page }) => {
    await openPanel(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeAttached()
  })

  test('panel closes when overlay is clicked outside the slide', async ({ page }) => {
    await openPanel(page)
    // Panel is 640px wide on the right; click far left — safely on the overlay backdrop
    await page.locator('.panel-overlay').click({ position: { x: 100, y: 300 } })
    await expect(page.getByRole('dialog')).not.toBeAttached()
  })

  test('Features tab is active by default', async ({ page }) => {
    await openPanel(page)
    await expect(page.getByRole('tab', { name: 'Features' })).toHaveAttribute('aria-selected', 'true')
  })

  test('clicking a non-built tab shows stub content', async ({ page }) => {
    await openPanel(page)
    await page.getByRole('tab', { name: 'AI' }).click()
    await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('AI tab — not yet built')).toBeVisible()
  })

  test('returning to Features tab after stub visit preserves content (lazy mount)', async ({ page }) => {
    await openPanel(page)
    await page.getByRole('tab', { name: 'AI' }).click()
    await page.getByRole('tab', { name: 'Features' }).click()
    // content was mounted on first visit and kept in DOM — still visible
    await expect(page.getByText('Lead Intake')).toBeVisible()
  })
})

// ─── FeatureToggles ──────────────────────────────────────────────────────────

test.describe('FeatureToggles', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/')
    await openPanel(page)
  })

  test('chat toggle is disabled — core, always on', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Chat' })
    await expect(toggle).toBeDisabled()
    await expect(page.getByText('Core — always on')).toBeVisible()
  })

  test('sms toggle is disabled — coming soon', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle SMS' })
    await expect(toggle).toBeDisabled()
    await expect(page.getByText('Coming soon')).toBeVisible()
  })

  test('toggling an enabled feature calls API with correct payload and flips optimistically', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Public Chat' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    const [request] = await Promise.all([
      page.waitForRequest('**/api/admin-toggle-feature'),
      toggle.click(),
    ])

    const body = JSON.parse(request.postData() ?? '{}') as {
      feature: string
      enabled: boolean
      slug: string
    }
    expect(body.feature).toBe('public_chat')
    expect(body.enabled).toBe(false)
    expect(body.slug).toBe('henderson')

    // optimistic flip held after success
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  test('toggling a disabled feature enables it', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Reviews' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('toggle reverts on API error and shows error toast', async ({ page }) => {
    // Override the catch-all success with a 500
    await page.route('**/api/admin-toggle-feature', (r) =>
      r.fulfill({ status: 500, json: { error: 'server error' } })
    )

    const toggle = page.getByRole('switch', { name: 'Toggle Public Chat' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()

    // Reverts to original state after error
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Save failed — try again')).toBeVisible()
  })

  test('dependency guard blocks disabling intake while lead_scoring is enabled', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Toggle Lead Intake' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await toggle.click()

    // Guard fires before API — toast appears immediately
    await expect(page.getByText('Disable Lead Scoring first')).toBeVisible()
    // Toggle stays checked — no state change
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
