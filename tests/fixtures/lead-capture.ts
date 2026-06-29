export const validLead = {
  name: 'Test User',
  email: 'test-suite+lead@example.invalid',
  phone: '555-000-0001',
  company: 'Test Co',
  message: 'Automated test submission — safe to ignore',
  source: 'test-suite',
  client_slug: 'henderson',
}

export const leadEmailOnly = {
  name: 'Email Only User',
  email: 'test-suite+emailonly@example.invalid',
  message: 'Test — email only contact',
  source: 'test-suite',
  client_slug: 'henderson',
}

export const leadPhoneOnly = {
  name: 'Phone Only User',
  phone: '555-000-0002',
  message: 'Test — phone only contact',
  source: 'test-suite',
  client_slug: 'henderson',
}

export const leadNoContact = {
  name: 'No Contact User',
  message: 'Test — no email or phone, should be rejected',
  source: 'test-suite',
  client_slug: 'henderson',
}
