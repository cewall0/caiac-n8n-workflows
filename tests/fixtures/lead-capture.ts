// Lead Capture v2.1.0 accepts Tally webhook format only.
// Auth: ?slug=<client_slug>&key=<webhook_secret> as query params.
// Henderson's field_map: { Name→name, Email→email, Phone→phone, Message→message, Source→source }

function field(label: string, value: string, type = 'INPUT_TEXT') {
  return { label, type, value }
}

function tallyPayload(fields: ReturnType<typeof field>[]) {
  return {
    data: { fields },
    createdAt: new Date().toISOString(),
  }
}

export const INTAKE_QUERY_PARAMS = {
  slug: process.env.TEST_CLIENT_SLUG ?? 'henderson',
  key: process.env.TEST_CLIENT_WEBHOOK_SECRET ?? '',
}

export const validLead = tallyPayload([
  field('Name', 'Test User'),
  field('Email', 'test-suite+lead@example.invalid', 'INPUT_EMAIL'),
  field('Phone', '555-000-0001', 'INPUT_PHONE_NUMBER'),
  field('Message', 'Automated test submission — safe to ignore'),
  field('Source', 'test-suite'),
])

export const leadEmailOnly = tallyPayload([
  field('Name', 'Email Only User'),
  field('Email', 'test-suite+emailonly@example.invalid', 'INPUT_EMAIL'),
  field('Message', 'Test — email only contact'),
  field('Source', 'test-suite'),
])

export const leadPhoneOnly = tallyPayload([
  field('Name', 'Phone Only User'),
  field('Phone', '555-000-0002', 'INPUT_PHONE_NUMBER'),
  field('Message', 'Test — phone only contact'),
  field('Source', 'test-suite'),
])

export const leadNoContact = tallyPayload([
  field('Name', 'No Contact User'),
  field('Message', 'Test — no email or phone'),
  field('Source', 'test-suite'),
])

export const invalidPayload = {
  name: 'Bad Format',
  email: 'bad@test.invalid',
  client_slug: 'henderson',
}
