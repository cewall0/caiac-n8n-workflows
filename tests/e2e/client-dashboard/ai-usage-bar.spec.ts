import { test, expect, type Page } from '@playwright/test';

const MOCK_USER_ADMIN = {
  id: 'user-test-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  client_id: 'client-test-1',
};

const MOCK_USER_CLIENT = {
  ...MOCK_USER_ADMIN,
  role: 'client',
};

const MOCK_CONFIG_BASE = {
  slug: 'henderson',
  name: 'Henderson & Associates',
  branding: {
    name: 'Henderson & Associates',
    tagline: 'Test firm',
    primary_color: '#6366f1',
    ai_persona_name: 'Kai',
  },
  features: { chat: true, file_upload: false },
  quick_actions: [],
  workflows: [],
  stats: {
    ai_conversations_week: 5,
    automations_last_24h: 2,
    documents_indexed: 10,
    active_users: 1,
    seat_limit: 5,
    hours_saved_yesterday: 1,
  },
};

const MOCK_USAGE = {
  cap: 100,
  request_count: 42,
  pct_used: 42.0,
  resets_at: '2026-07-01',
  period: '2026-06',
};

async function injectAuth(page: Page, user = MOCK_USER_ADMIN) {
  await page.addInitScript((u) => {
    sessionStorage.setItem('caiac_client_token', 'mock-token-abc');
    sessionStorage.setItem('caiac_client_webhook_secret', 'mock-secret-xyz');
    sessionStorage.setItem('caiac_client_user', JSON.stringify(u));
  }, user);
}

async function mockClientConfig(page: Page, featureOverrides: Record<string, boolean> = {}) {
  const config = {
    ...MOCK_CONFIG_BASE,
    features: { ...MOCK_CONFIG_BASE.features, ...featureOverrides },
  };
  await page.route('**/api/client-config**', (route) => route.fulfill({ json: config }));
}

// ── AIUsageBar ─────────────────────────────────────────────────────────────

test('AIUsageBar is absent when advanced_ai feature is off', async ({ page }) => {
  await injectAuth(page);
  await mockClientConfig(page);
  await page.goto('/');

  await expect(page.getByTestId('ai-usage-bar')).not.toBeAttached();
});

test('AIUsageBar renders when advanced_ai feature is on', async ({ page }) => {
  await injectAuth(page);
  await mockClientConfig(page, { advanced_ai: true });
  await page.route('**/api/client-ai-usage', (route) =>
    route.fulfill({ json: MOCK_USAGE }),
  );

  await page.goto('/');

  await expect(page.getByTestId('ai-usage-bar')).toBeVisible();
  await expect(page.getByTestId('ai-usage-count')).toHaveText('42 / 100');
});

test('AIUsageBar shows orange when usage >= 80%', async ({ page }) => {
  await injectAuth(page);
  await mockClientConfig(page, { advanced_ai: true });
  await page.route('**/api/client-ai-usage', (route) =>
    route.fulfill({
      json: { ...MOCK_USAGE, request_count: 85, pct_used: 85.0 },
    }),
  );

  await page.goto('/');

  const fill = page.getByTestId('ai-usage-fill');
  await expect(fill).toBeVisible();
  await expect(fill).toHaveClass(/bg-orange-400/);
});

test('AIUsageBar absent when advanced_ai on but feature returns 404', async ({ page }) => {
  await injectAuth(page);
  await mockClientConfig(page, { advanced_ai: true });
  await page.route('**/api/client-ai-usage', (route) =>
    route.fulfill({ status: 404, json: { error: 'Feature not enabled' } }),
  );

  await page.goto('/');

  // Component renders (enabled=true) but stays hidden because data is null
  await expect(page.getByTestId('ai-usage-bar')).not.toBeAttached();
});

// ── Chat footer copy ────────────────────────────────────────────────────────

test('chat footer shows generic copy when cloud_consent is off', async ({ page }) => {
  // Use client role to land directly in ChatView
  await injectAuth(page, MOCK_USER_CLIENT);
  await mockClientConfig(page, { cloud_consent: false });

  await page.goto('/');

  const footer = page.getByTestId('chat-footer');
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('Powered by AI');
  await expect(footer).not.toContainText('Claude');
});

test('chat footer shows Claude copy when cloud_consent is on', async ({ page }) => {
  await injectAuth(page, MOCK_USER_CLIENT);
  await mockClientConfig(page, { cloud_consent: true });

  await page.goto('/');

  const footer = page.getByTestId('chat-footer');
  await expect(footer).toBeVisible();
  await expect(footer).toContainText("Powered by Claude");
  await expect(footer).toContainText("Anthropic");
});
